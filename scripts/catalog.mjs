#!/usr/bin/env node
/**
 * Regenerate `catalog.json` from the packed archives.
 *
 * The catalog is what `MERCURY_PLUGIN_CATALOG_URL` points at: an index of installable
 * plugins, each pinned to a version, a size and a SHA-256. Mercury validates every entry
 * against a strict schema and refuses an artifact whose hash does not match, so this file
 * has to be generated from the bytes that were actually attached to a release — never
 * hand-edited.
 *
 * The artifact URLs use the release tag convention `<id>-v<version>`; `release.yml` creates
 * exactly that tag and attaches `<id>-<version>.tgz` to it.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { manifestOf, pluginDirs, root, sha256 } from './lib.mjs';

const REPO = process.env.MERCURY_PLUGINS_REPO ?? 'tournierjc/mercury-plugins';
const dist = join(root, 'dist');

const plugins = [];
for (const { dir } of pluginDirs()) {
  const manifest = manifestOf(dir);
  const archive = join(dist, `${manifest.id}-${manifest.version}.tgz`);
  if (!existsSync(archive)) {
    console.error(`catalog: ${archive} is missing — run \`npm run pack\` first.`);
    process.exit(1);
  }
  plugins.push({
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    kind: manifest.kind,
    tier: 'community',
    homepage: `https://github.com/${REPO}/tree/main/plugins/${dir.split('/').pop()}`,
    engines: {
      mercury: manifest.engines.mercury,
      pluginApi: manifest.engines.pluginApi,
    },
    artifact: {
      url: `https://github.com/${REPO}/releases/download/${manifest.id}-v${manifest.version}/${manifest.id}-${manifest.version}.tgz`,
      sha256: sha256(archive),
      size: statSync(archive).size,
    },
    tools: (manifest.contributes?.tools ?? []).map((tool) => tool.name),
    permissions: {
      network: manifest.permissions?.network ?? [],
      secrets: manifest.permissions?.secrets ?? [],
    },
  });
}

const catalog = {
  catalogVersion: 1,
  // A fixed timestamp keeps the file byte-identical when nothing changed, so CI can fail on
  // drift instead of rewriting it on every run.
  updatedAt: process.env.MERCURY_PLUGINS_UPDATED_AT ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  plugins,
};

const path = join(root, 'catalog.json');
const previous = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
if (previous) {
  const strip = (value) => JSON.stringify({ ...value, updatedAt: undefined });
  if (strip(previous) === strip(catalog)) {
    catalog.updatedAt = previous.updatedAt;
  }
}

writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`catalog.json — ${plugins.length} plugin(s): ${plugins.map((p) => `${p.id}@${p.version}`).join(', ')}`);
