#!/usr/bin/env node
/**
 * Build `roster/roster.json` — the same fleet as one Mercury bundle.
 *
 * The bundle is what the dashboard and the Android app import (`mercury-bot-bundle` v1), and
 * generating it from the bot folders keeps one source of truth: a bot edited in
 * `roster/bots/` is a bot edited in the bundle, or the build fails.
 *
 * The YAML here is read by a deliberately small reader — the roster uses four constructs
 * (maps, lists of maps, flow lists, scalars) and pulling a YAML dependency into a repository
 * whose rule is "no dependencies" would be the tail wagging the dog.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './lib.mjs';

const botsRoot = join(root, 'roster', 'bots');

const scalar = (raw) => {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map((part) => part.trim().replace(/^"|"$/g, '')).filter(Boolean);
  }
  return value.replace(/^"(.*)"$/, '$1');
};

/** Enough YAML for the files in this folder, and nothing more. */
function parseYaml(text) {
  const out = {};
  let current = null;
  let list = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    if (indent === 0) {
      const [key, ...rest] = trimmed.split(':');
      const value = rest.join(':').trim();
      if (value) {
        out[key] = scalar(value);
        current = null;
        list = null;
      } else {
        out[key] = {};
        current = key;
        list = null;
      }
      continue;
    }
    if (!current) continue;
    if (trimmed.startsWith('- ')) {
      const entry = trimmed.slice(2);
      if (!Array.isArray(out[current])) out[current] = [];
      if (entry.includes(': ')) {
        const [key, ...rest] = entry.split(':');
        list = { [key.trim()]: scalar(rest.join(':').trim()) };
        out[current].push(list);
      } else {
        list = null;
        out[current].push(scalar(entry));
      }
      continue;
    }
    const [key, ...rest] = trimmed.split(':');
    const value = rest.join(':').trim();
    // A list item's continuation keys attach to the last map pushed.
    const target = list ?? (out[current] ??= {});
    target[key.trim()] = value ? scalar(value) : {};
  }
  return out;
}

const readBots = () => {
  const ids = readdirSync(botsRoot).sort();
  const lead = ids.find((id) => parseYaml(readFileSync(join(botsRoot, id, 'bot.yaml'), 'utf8')).fleetRole === 'lead');
  if (!lead) throw new Error('the roster has no lead (fleetRole: lead)');
  const entries = [];
  for (const id of [lead, ...ids.filter((other) => other !== lead)]) {
    const dir = join(botsRoot, id);
    const bot = parseYaml(readFileSync(join(dir, 'bot.yaml'), 'utf8'));
    const permissions = parseYaml(readFileSync(join(dir, 'permissions.yaml'), 'utf8'));
    if (bot.id !== id) throw new Error(`roster/bots/${id}/bot.yaml declares id ${bot.id}`);
    if (id !== lead && bot.parent !== lead) throw new Error(`roster/bots/${id}: parent must be ${lead}`);
    const skills = {};
    if (existsSync(join(dir, 'skills'))) {
      for (const file of readdirSync(join(dir, 'skills'))) {
        skills[file] = readFileSync(join(dir, 'skills', file), 'utf8');
      }
    }
    entries.push({
      id,
      name: bot.name,
      description: bot.description,
      manifest: bot,
      persona: readFileSync(join(dir, 'persona.md'), 'utf8'),
      permissions,
      ...(Object.keys(skills).length > 0 ? { skills } : {}),
    });
  }
  return entries;
};

const bots = readBots();
const bundle = {
  format: 'mercury-bot-bundle',
  version: 1,
  kind: 'fleet',
  root: bots[0].id,
  exportedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  bots,
};

const path = join(root, 'roster', 'roster.json');
const previous = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
const without = (value) => JSON.stringify({ ...value, exportedAt: undefined });
if (previous && without(previous) === without(bundle)) bundle.exportedAt = previous.exportedAt;

writeFileSync(path, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(`roster.json — ${bots.length} bots, lead ${bundle.root}: ${bots.map((b) => b.id).join(', ')}`);
