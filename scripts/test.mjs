#!/usr/bin/env node
/**
 * Run every plugin's own test suite (`test/*.test.mjs`, node:test).
 *
 * A plugin with no tests is reported, not skipped silently: the repository's rule is that
 * each plugin states its contract somewhere a machine can check it.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { manifestOf, pluginDirs, run } from './lib.mjs';

let failed = 0;
let untested = [];
for (const { dir } of pluginDirs()) {
  const manifest = manifestOf(dir);
  const testDir = join(dir, 'test');
  const files = existsSync(testDir)
    ? readdirSync(testDir).filter((name) => name.endsWith('.test.mjs')).sort()
    : [];
  if (files.length === 0) {
    untested.push(manifest.id);
    continue;
  }
  try {
    run(process.execPath, ['--test', ...files.map((name) => join('test', name))], dir);
  } catch {
    failed += 1;
  }
}

if (untested.length > 0) console.log(`no tests: ${untested.join(', ')}`);
if (failed > 0) {
  console.error(`\n${failed} plugin suite(s) failed.`);
  process.exit(1);
}
console.log('\nall plugin suites passed.');
