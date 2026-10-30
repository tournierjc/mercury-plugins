#!/usr/bin/env node
/**
 * Check what Mercury will check, before a release exists.
 *
 * This mirrors the rules from Mercury's own installer (`src/plugins/installer.ts` and
 * `types.ts`): manifest shape and id rules, one bundled entry module, no symlinks, the
 * archive unpacked under a single folder, and a catalog whose SHA-256 and size match the
 * bytes. Keeping the rules here means a broken package fails in CI rather than in the
 * owner's daemon, where the error arrives far from the cause.
 *
 * It deliberately does NOT decide compatibility: that depends on the Mercury version the
 * owner runs, and the catalog states it in `engines`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { manifestOf, pluginDirs, root, sha256, walk } from './lib.mjs';

const LIMITS = { files: 5000, unpackedBytes: 400 * 1024 * 1024 };
const ID_RE = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;
const RESERVED_IDS = new Set(['mcp']);
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const problems = [];
const fail = (message) => problems.push(message);

// ── manifests ──────────────────────────────────────────────────────────────
const manifests = [];
for (const { dir, name } of pluginDirs()) {
  const where = `plugins/${name}`;
  let manifest;
  try {
    manifest = manifestOf(dir);
  } catch (error) {
    fail(`${where}: mercury-plugin.json is not valid JSON (${error.message})`);
    continue;
  }
  manifests.push({ dir, name, manifest });

  if (manifest.manifestVersion !== 1) fail(`${where}: manifestVersion must be 1`);
  if (!ID_RE.test(manifest.id ?? '')) fail(`${where}: id "${manifest.id}" breaks 3-32 lowercase letters, digits and hyphens`);
  if (RESERVED_IDS.has(manifest.id)) fail(`${where}: id "${manifest.id}" is reserved by Mercury`);
  if (!SEMVER.test(manifest.version ?? '')) fail(`${where}: version "${manifest.version}" is not semver`);
  if (!manifest.name || manifest.name.length > 60) fail(`${where}: name is required (max 60)`);
  if (!manifest.description || manifest.description.length > 280) fail(`${where}: description is required (max 280)`);
  if (!['in-process', 'out-of-process'].includes(manifest.kind)) fail(`${where}: kind must be in-process or out-of-process`);
  if (!manifest.engines?.mercury) fail(`${where}: engines.mercury is required`);
  if (!manifest.engines?.pluginApi) fail(`${where}: engines.pluginApi is required`);
  if (manifest.kind === 'in-process') {
    if (!manifest.entry) fail(`${where}: in-process plugins need an entry module`);
    else if (!/\.m?js$/.test(manifest.entry)) fail(`${where}: the entry must be a bundled .js or .mjs file`);
    else if (!existsSync(join(dir, manifest.entry))) fail(`${where}: entry "${manifest.entry}" is missing`);
  }
  for (const renderer of manifest.contributes?.renderers ?? []) {
    if (!/^[a-z][a-z0-9+#-]{0,24}$/.test(renderer.language ?? '')) fail(`${where}: renderer language "${renderer.language}" is not a fenced-block name`);
    if (!renderer.asset || !existsSync(join(dir, renderer.asset))) fail(`${where}: renderer asset "${renderer.asset}" is missing`);
    if (renderer.sandbox !== 'iframe') fail(`${where}: renderer sandbox must be "iframe" (the only sandbox Mercury hosts)`);
  }
}

// ── archives ───────────────────────────────────────────────────────────────
const dist = join(root, 'dist');
for (const { manifest } of manifests) {
  const archive = join(dist, `${manifest.id}-${manifest.version}.tgz`);
  if (!existsSync(archive)) {
    fail(`dist/${manifest.id}-${manifest.version}.tgz is missing — run \`npm run pack\``);
    continue;
  }
  const unpacked = mkdtempSync(join(tmpdir(), 'mercury-plugins-'));
  try {
    execFileSync('tar', ['-xzf', archive, '-C', unpacked], { stdio: 'pipe' });
    const top = readdirSync(unpacked).filter((n) => !n.startsWith('.'));
    const packageRoot = top.length === 1 ? join(unpacked, top[0]) : unpacked;
    if (!existsSync(join(packageRoot, 'mercury-plugin.json'))) {
      fail(`${manifest.id}: no mercury-plugin.json at the top of the package`);
      continue;
    }
    const files = walk(packageRoot);
    const bytes = files.reduce((sum, file) => sum + statSync(join(packageRoot, file)).size, 0);
    if (files.length > LIMITS.files) fail(`${manifest.id}: ${files.length} files (limit ${LIMITS.files})`);
    if (bytes > LIMITS.unpackedBytes) fail(`${manifest.id}: ${(bytes / 1048576).toFixed(1)} MB unpacked (limit 400 MB)`);
    const shipped = manifestOf(packageRoot);
    if (shipped.version !== manifest.version) fail(`${manifest.id}: the archive carries version ${shipped.version}, the folder ${manifest.version}`);
    if (shipped.entry && !files.includes(shipped.entry)) fail(`${manifest.id}: the archive is missing its entry (${shipped.entry})`);
  } finally {
    rmSync(unpacked, { recursive: true, force: true });
  }
}

// ── catalog ────────────────────────────────────────────────────────────────
const catalogPath = join(root, 'catalog.json');
if (!existsSync(catalogPath)) {
  fail('catalog.json is missing — run `npm run catalog`');
} else {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  if (catalog.catalogVersion !== 1) fail('catalog.json: catalogVersion must be 1');
  if (!Array.isArray(catalog.plugins) || catalog.plugins.length === 0) fail('catalog.json: no plugins');
  for (const entry of catalog.plugins ?? []) {
    if (!ID_RE.test(entry.id)) fail(`catalog.json: ${entry.id} is not a plugin id`);
    if (!['official', 'community'].includes(entry.tier)) fail(`catalog.json: ${entry.id} tier must be official or community`);
    if (!entry.artifact?.url?.startsWith('https://')) fail(`catalog.json: ${entry.id} artifact must be https`);
    if (!/^[a-f0-9]{64}$/.test(entry.artifact?.sha256 ?? '')) fail(`catalog.json: ${entry.id} needs a sha256`);
    const archive = join(dist, `${entry.id}-${entry.version}.tgz`);
    if (!existsSync(archive)) {
      fail(`catalog.json: ${entry.id}@${entry.version} has no archive`);
      continue;
    }
    if (sha256(archive) !== entry.artifact.sha256) fail(`catalog.json: ${entry.id} sha256 does not match the archive`);
    if (statSync(archive).size !== entry.artifact.size) fail(`catalog.json: ${entry.id} size does not match the archive`);
  }
  const missing = manifests.filter(({ manifest }) => !(catalog.plugins ?? []).some((e) => e.id === manifest.id));
  if (missing.length > 0) fail(`catalog.json: missing ${missing.map((m) => m.manifest.id).join(', ')}`);
}

// ── report ─────────────────────────────────────────────────────────────────
if (problems.length > 0) {
  console.error(`${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}
console.log(`verify — ${manifests.length} plugin(s) checked: ${manifests.map((m) => `${m.manifest.id}@${m.manifest.version}`).join(', ')}`);
