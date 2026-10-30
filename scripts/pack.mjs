#!/usr/bin/env node
/**
 * Pack every plugin into `dist/<id>-<version>.tgz`.
 *
 * The archive is npm-pack shaped — everything under a single `<id>-<version>/` folder —
 * because Mercury's installer accepts exactly two layouts: a manifest at the top of the
 * archive, or a manifest one folder down. Nothing else about the name matters, but the
 * folder keeps an unpacked package readable on disk.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
  // Reproducible on purpose: a fixed mtime, sorted names, numeric owner, and `gzip -n` so
  // the gzip header carries no timestamp. CI rebuilds the archives to compare their hashes
  // with `catalog.json`, and a fresh timestamp would make every rebuild differ — the catalog
  // would then pin bytes that no longer exist.
  const gz = execFileSync('gzip', ['-n', '-9', '-c'], {
    cwd: root,
    input: execFileSync(
      'tar',
      ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
        '--format=ustar', '-cf', '-', '-C', staging, folder],
      { cwd: root, maxBuffer: 64 * 1024 * 1024 },
    ),
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(archive, gz);
  rmSync(staging, { recursive: true, force: true });

  const kb = (statSync(archive).size / 1024).toFixed(1);
  console.log(`pack   ${folder}.tgz — ${kb} KB (${files.join(', ')})`);
}

console.log(`\narchives in ${dist}`);
