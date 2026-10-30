#!/usr/bin/env node
/**
 * Build every plugin that has a build step.
 *
 * A plugin without `scripts/build.mjs` is copied as-is: its `index.mjs` is the source.
 * `diff-view` is that case — one entry module and one HTML renderer, nothing to compile.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { manifestOf, pluginDirs, run } from './lib.mjs';

let built = 0;
for (const { name, dir } of pluginDirs()) {
  const manifest = manifestOf(dir);
  const buildScript = join(dir, 'scripts', 'build.mjs');
  if (existsSync(buildScript)) {
    process.stdout.write(`build  ${manifest.id}@${manifest.version} … `);
    run(process.execPath, [buildScript], dir);
    built += 1;
  } else {
    console.log(`build  ${manifest.id}@${manifest.version} — nothing to build`);
  }
}
console.log(`\n${built} plugin(s) built, ${pluginDirs().length} present.`);
