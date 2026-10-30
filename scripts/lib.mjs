/**
 * Shared helpers for the plugin scripts. No dependencies: the whole point of this
 * repository is that a plugin can be built with nothing but Node.js, exactly like the
 * plugins themselves (an in-process plugin must be one bundled file, so it cannot bring
 * its own packages into Mercury's binary).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const pluginsDir = join(root, 'plugins');

/** Every plugin folder, sorted so the catalog and the logs are stable. */
export function pluginDirs() {
  return readdirSync(pluginsDir)
    .filter((name) => existsSync(join(pluginsDir, name, 'mercury-plugin.json')))
    .sort()
    .map((name) => ({ name, dir: join(pluginsDir, name) }));
}

export function manifestOf(dir) {
  return JSON.parse(readFileSync(join(dir, 'mercury-plugin.json'), 'utf8'));
}

/**
 * The files a package ships: the manifest, the entry module, every renderer asset, the
 * type definitions and the README. `src/`, `test/` and the build script stay in the
 * repository — a package is what the daemon runs, not what we work on.
 */
export function packageFiles(dir, manifest) {
  const files = ['mercury-plugin.json', manifest.entry];
  for (const renderer of manifest.contributes?.renderers ?? []) files.push(renderer.asset);
  for (const extra of ['README.md', 'mercury-plugin.d.ts']) files.push(extra);
  const kept = [...new Set(files.filter((file) => existsSync(join(dir, file))))];
  const missing = files.filter((file) => !existsSync(join(dir, file)));
  return { files: kept, missing };
}

export function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

export function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, base, out);
    else out.push(full.slice(base.length + 1));
  }
  return out;
}
