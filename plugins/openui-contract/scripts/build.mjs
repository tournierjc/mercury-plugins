#!/usr/bin/env node
/**
 * Build the two artifacts of this plugin from one source:
 *
 *   src/index.js + src/parse.js  ->  index.mjs            (the in-process plugin, one file)
 *   src/renderer.js + parse.js   ->  renderer/openui.html (the sandboxed renderer)
 *
 * Both bundle the same parser, so the tool that validates and the renderer that draws
 * cannot disagree about the contract. esbuild comes from npx: no dependency to install.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (...args) => execFileSync('npx', ['--yes', 'esbuild', ...args], { cwd: root, stdio: 'inherit' });

run('src/index.js', '--bundle', '--format=esm', '--platform=node', '--target=node22', '--outfile=index.mjs', '--log-level=warning');
run('src/renderer.js', '--bundle', '--format=iife', '--platform=browser', '--target=es2020', '--outfile=.build/renderer.js', '--log-level=warning');

// A `</script` inside the bundle would close the tag it is inlined into.
const bundle = readFileSync(join(root, '.build/renderer.js'), 'utf8').replaceAll('</script', '<\\/script');
const template = readFileSync(join(root, 'src/renderer.html'), 'utf8');
if (!template.includes('/*__BUNDLE__*/')) throw new Error('the renderer template lost its /*__BUNDLE__*/ placeholder');

mkdirSync(join(root, 'renderer'), { recursive: true });
writeFileSync(join(root, 'renderer/openui.html'), template.replace('/*__BUNDLE__*/', bundle));
rmSync(join(root, '.build'), { recursive: true, force: true });

const size = (path) => `${(readFileSync(join(root, path)).length / 1024).toFixed(1)} KB`;
console.log(`index.mjs ${size('index.mjs')} · renderer/openui.html ${size('renderer/openui.html')}`);
