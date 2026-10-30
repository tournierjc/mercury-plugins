import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSpec, contract } from '../index.mjs';

const codes = (result) => result.errors.map((e) => e.code);

const GOOD = [
  'root = Stack([title, counts, fleet])',
  'title = Text({"text": "Fleet du matin", "variant": "h2"})',
  'counts = KeyValue({"label": "En attente", "value": "2", "highlight": true})',
  'fleet = Table({"columns": ["Bot", "État"], "rows": [["CEO", "attente"]]})',
].join('\n');

test('the example from the contract validates', () => {
  const result = validateSpec(contract.EXAMPLE);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.nodes, 6);
});

test('the canonical form sorts props, puts root last, and is stable', () => {
  const first = validateSpec(GOOD);
  assert.equal(first.ok, true);
  const lines = first.canonical.split('\n');
  assert.ok(lines[lines.length - 1].startsWith('root = Stack('), 'root closes the spec');
  assert.ok(lines[0].startsWith('counts = KeyValue({"highlight":true,"label"'), 'props sorted');
  assert.equal(validateSpec(first.canonical).canonical, first.canonical, 'canonical form is a fixed point');
});

test('an empty spec is refused', () => {
  assert.deepEqual(codes(validateSpec('   ')), ['empty']);
});

test('a component outside the allowlist is refused, and the error names the allowed ones', () => {
  const result = validateSpec('root = Form({"fields": []})');
  assert.deepEqual(codes(result), ['unknown_component']);
  assert.match(result.errors[0].message, /Stack, Text, Card, KeyValue, Table, List, Stat/);
});

test('a URL-bearing prop is refused even when the component exists', () => {
  const result = validateSpec(['root = Stack([a])', 'a = Card({"href": "https://example.com"})'].join('\n'));
  assert.deepEqual(codes(result), ['forbidden_prop']);
});

test('a prop that merely is not in the contract is refused', () => {
  const result = validateSpec(['root = Stack([a])', 'a = Card({"title": "ok", "shadow": "2"})'].join('\n'));
  assert.deepEqual(codes(result), ['unknown_prop']);
  assert.match(result.errors[0].message, /allowed: title, body, tone/);
});

test('a dangling reference is caught', () => {
  const result = validateSpec(['root = Stack([ghost])', 'a = Text({"text": "x"})'].join('\n'));
  assert.ok(codes(result).includes('dangling_ref'));
});

test('an orphan is caught: nothing renders what nobody references', () => {
  const result = validateSpec(['root = Stack([a])', 'a = Text({"text": "x"})', 'b = Text({"text": "smuggled"})'].join('\n'));
  assert.deepEqual(codes(result), ['orphan']);
  assert.match(result.errors[0].message, /"b"/);
});

test('a cycle through children is caught instead of hanging a renderer', () => {
  const result = validateSpec(['root = Stack([a])', 'a = Stack([root])'].join('\n'));
  assert.ok(codes(result).includes('cycle'));
});

test('a duplicate id is refused', () => {
  const result = validateSpec(['root = Stack([a])', 'a = Text({"text": "1"})', 'a = Text({"text": "2"})'].join('\n'));
  assert.deepEqual(codes(result), ['duplicate_id']);
});

test('a spec with no root is refused', () => {
  const result = validateSpec('a = Text({"text": "x"})');
  assert.ok(codes(result).includes('no_root'));
});

test('arguments that are not JSON are refused, not guessed at', () => {
  const result = validateSpec(["root = Stack([a])", "a = Text({text: 'x'})"].join('\n'));
  assert.deepEqual(codes(result), ['bad_json']);
});

test('the node budget is enforced', () => {
  const result = validateSpec(GOOD, { maxNodes: 2 });
  assert.ok(codes(result).includes('too_many_nodes'));
});

test('a string over the limit is refused', () => {
  const long = 'y'.repeat(1201);
  const result = validateSpec(['root = Text({"text": ' + JSON.stringify(long) + '})'].join('\n'));
  assert.deepEqual(codes(result), ['string_too_long']);
});

test('an enum outside its values is refused', () => {
  const result = validateSpec('root = Text({"text": "x", "variant": "banner"})');
  assert.deepEqual(codes(result), ['bad_enum']);
});

test('an id with a dash or uppercase is refused', () => {
  assert.deepEqual(codes(validateSpec('root = Stack([Bad-Id])')), ['bad_ref']);
  assert.deepEqual(codes(validateSpec('Bad = Text({"text": "x"})')), ['bad_id']);
});

test('multiple errors are reported together, line by line', () => {
  const spec = ['root = Stack([a, b])', 'a = Form({})', 'b = Card({"href": "x"})'].join('\n');
  const result = validateSpec(spec);
  assert.equal(result.ok, false);
  assert.deepEqual(codes(result), ['unknown_component', 'forbidden_prop']);
  assert.deepEqual(result.errors.map((e) => e.line), [2, 3]);
});

test('the allowlist is exactly the nine v1 components', () => {
  assert.deepEqual(Object.keys(contract.COMPONENTS), [
    'Stack', 'Text', 'Card', 'KeyValue', 'Table', 'List', 'Stat', 'Code', 'Chart',
  ]);
});

test('a chart needs numbers for its values, not strings that look like them', () => {
  const chart = (values) =>
    validateSpec(`root = Chart({"kind": "bar", "labels": ["a"], "values": ${values}})`);
  assert.equal(chart('[1]').ok, true);
  assert.deepEqual(codes(chart('["1"]')), ['bad_type']);
  assert.deepEqual(codes(chart('[1, "x"]')), ['bad_type']);
});

test('a chart kind outside bar and line is refused', () => {
  assert.deepEqual(
    codes(validateSpec('root = Chart({"kind": "pie", "labels": ["a"], "values": [1]})')),
    ['bad_enum'],
  );
});

test('code gets a longer limit than prose, and still has one', () => {
  const code = (text) => validateSpec('root = Code({"code": ' + JSON.stringify(text) + '})');
  assert.equal(code('x'.repeat(1500)).ok, true, 'code is not prose');
  assert.deepEqual(codes(code('x'.repeat(4001))), ['string_too_long']);
});

test('every component except Stack needs props, and Stack takes only children', () => {
  assert.equal(contract.COMPONENTS.Stack.children, true);
  for (const [name, definition] of Object.entries(contract.COMPONENTS)) {
    if (name === 'Stack') continue;
    assert.equal(definition.children, undefined, name);
    assert.ok(Object.keys(definition.props).length > 0, name);
  }
});

/**
 * The plugin surface: activate() itself, driven through a stub context. This is what
 * Mercury does when it starts the plugin, minus the process.
 */
function fakeContext(settings = {}) {
  const tools = new Map();
  const commands = new Map();
  const ctx = {
    apiVersion: '1.2.0',
    mercuryVersion: '1.4.2',
    plugin: { id: 'openui-contract', version: '0.1.0', dataDir: '/tmp' },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: { get: (key) => settings[key], all: () => settings },
    secrets: { get: () => undefined },
    timers: { setTimeout() {}, setInterval() {} },
    fetch: async () => {
      throw new Error('this plugin must never reach the network');
    },
    signal: new AbortController().signal,
    onDispose() {},
    tools: { register: (definition) => tools.set(definition.name, definition) },
    commands: { register: (definition) => commands.set(definition.name, definition) },
  };
  return { ctx, tools, commands };
}

test('activate registers exactly one tool and one command, and nothing else', async () => {
  const { activate } = await import('../index.mjs');
  const { ctx, tools, commands } = fakeContext();
  await activate(ctx);
  assert.deepEqual([...tools.keys()], ['render_ui']);
  assert.deepEqual([...commands.keys()], ['openui_contract']);
  assert.equal(tools.get('render_ui').inputSchema.required[0], 'spec');
});

test('the tool answers with the canonical spec, as JSON text a model can read', async () => {
  const { activate, contract } = await import('../index.mjs');
  const EXAMPLE = contract.EXAMPLE;
  const { ctx, tools } = fakeContext();
  await activate(ctx);
  const answer = JSON.parse(await tools.get('render_ui').execute({ spec: EXAMPLE }));
  assert.equal(answer.ok, true);
  assert.equal(answer.nodes, 6);
  assert.ok(answer.spec.includes('root = Stack([title, counts, fleet, latency, snippet])'));
});

test('the tool reports errors with their line, so the model can fix them', async () => {
  const { activate } = await import('../index.mjs');
  const { ctx, tools } = fakeContext();
  await activate(ctx);
  const answer = JSON.parse(
    await tools.get('render_ui').execute({ spec: ['root = Stack([a])', 'a = Form({})'].join('\n') }),
  );
  assert.equal(answer.ok, false);
  assert.deepEqual(answer.errors.map((e) => [e.line, e.code]), [[2, 'unknown_component']]);
});

test('the settings budget reaches the validator', async () => {
  const { activate, contract } = await import('../index.mjs');
  const EXAMPLE = contract.EXAMPLE;
  const { ctx, tools } = fakeContext({ max_nodes: 2 });
  await activate(ctx);
  const answer = JSON.parse(await tools.get('render_ui').execute({ spec: contract.EXAMPLE }));
  assert.equal(answer.ok, false);
  assert.ok(answer.errors.some((e) => e.code === 'too_many_nodes'));
});

test('the command shows the allowlist, and the example on demand', async () => {
  const { activate } = await import('../index.mjs');
  const { ctx, commands } = fakeContext();
  await activate(ctx);
  const replies = [];
  const io = { reply: async (text) => replies.push(text) };
  await commands.get('openui_contract').run('', io);
  await commands.get('openui_contract').run('example', io);
  assert.match(replies[0], /Stack: children only/);
  assert.match(replies[0], /Table: columns, rows, caption/);
  assert.match(replies[1], /^\u0060\u0060\u0060openui/);
});
