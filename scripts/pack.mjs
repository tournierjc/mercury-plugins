#!/usr/bin/env node
/**
 * Pack every plugin into `dist/<id>-<version>.tgz`.
 *
 * The archive is npm-pack shaped — everything under a single `<id>-<version>/` folder —
 * because Mercury's installer accepts exactly two layouts: a manifest at the top of the
 * archive, or a manifest one folder down. Nothing else about the name matters, but the
 * folder keeps an unpacked package readable on disk.
 */
import { cpSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { manifestOf, packageFiles, pluginDirs, root, run } from './lib.mjs';

const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

for (const { dir } of pluginDirs()) {
  const manifest = manifestOf(dir);
  const staging = join(dist, 'staging');
  const folder = `${manifest.id}-${manifest.version}`;
  const packageDir = join(staging, folder);

  rmSync(staging, { recursive: true, force: true });
  mkdirSync(packageDir, { recursive: true });

  const { files, missing } = packageFiles(dir, manifest);
  if (missing.length > 0) {
    console.error(`pack   ${manifest.id}: missing from the plugin folder: ${missing.join(', ')}`);
    process.exit(1);
  }
  for (const file of files) cpSync(join(dir, file), join(packageDir, file), { recursive: true });

  const archive = join(dist, `${folder}.tgz`);
  // `-h` would follow symlinks; there are none, and the installer refuses them anyway.
  run('tar', ['-czf', archive, '-C', staging, folder], root);
  rmSync(staging, { recursive: true, force: true });

  const kb = (statSync(archive).size / 1024).toFixed(1);
  console.log(`pack   ${folder}.tgz — ${kb} KB (${files.join(', ')})`);
}

console.log(`\narchives in ${dist}`);
