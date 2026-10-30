/**
 * OpenUI Lang v1 — the one implementation of the contract.
 *
 * Used three ways, from this one file: the plugin's `render_ui` tool validates with it,
 * the renderer draws with it, and the tests exercise it. Pure: no Node, no DOM, so both
 * sides bundle the same code.
 *
 * The rules are in CONTRACT.md. `partial: true` is the streaming mode: structural
 * complaints (a root that has not arrived yet, children not yet defined) are not errors
 * mid-answer, they are just "not yet". Everything that could make rendering unsafe —
 * unknown components, unknown props, URLs, scripts — is refused in both modes.
 */

export const COMPONENTS = {
  Stack: { children: true, props: {} },
  Text: { props: { text: 'string', variant: ['body', 'h1', 'h2', 'h3', 'mono'], muted: 'boolean' } },
  Card: { props: { title: 'string', body: 'string', tone: ['neutral', 'ok', 'warn', 'danger'] } },
  KeyValue: { props: { label: 'string', value: 'string', highlight: 'boolean' } },
  Table: { props: { columns: 'string[]', rows: 'string[][]', caption: 'string' } },
  List: { props: { items: 'string[]', ordered: 'boolean' } },
  Stat: { props: { label: 'string', value: 'string', delta: 'string', tone: ['neutral', 'ok', 'warn', 'danger'] } },
  Code: { props: { code: 'code', language: 'string', title: 'string' } },
  Chart: { props: { kind: ['bar', 'line'], labels: 'string[]', values: 'number[]', title: 'string', unit: 'string' } },
};

export const FORBIDDEN_PROPS = new Set([
  'href', 'url', 'uri', 'src', 'srcset', 'html', 'innerhtml', 'script', 'style',
  'onclick', 'onload', 'onerror', 'action', 'formaction', 'image', 'img', 'svg',
  'iframe', 'embed', 'object', 'data', 'background', 'class', 'classname',
]);

const ID = /^[a-z][a-z0-9_]{0,23}$/;
const STATEMENT = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Z][A-Za-z0-9]*)\s*\(([\s\S]*)\)$/;

export const LIMITS = { string: 1200, code: 4000, items: 60, nodes: 60, bytes: 32768 };

function parseIds(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (inner === '') return [];
  return inner.split(',').map((part) => part.trim());
}

function checkValue(name, value, rule, line) {
  if (rule === 'string') {
    if (typeof value !== 'string') return [{ line, code: 'bad_type', message: `${name} must be a string` }];
    if (value.length > LIMITS.string) return [{ line, code: 'string_too_long', message: `${name} is ${value.length} characters; the limit is ${LIMITS.string}` }];
    return [];
  }
  if (rule === 'code') {
    if (typeof value !== 'string') return [{ line, code: 'bad_type', message: `${name} must be a string` }];
    if (value.length > LIMITS.code) return [{ line, code: 'string_too_long', message: `${name} is ${value.length} characters; the limit is ${LIMITS.code}` }];
    return [];
  }
  if (rule === 'boolean') {
    if (typeof value !== 'boolean') return [{ line, code: 'bad_type', message: `${name} must be true or false` }];
    return [];
  }
  if (rule === 'string[]') {
    if (!Array.isArray(value)) return [{ line, code: 'bad_type', message: `${name} must be a list of strings` }];
    if (value.length > LIMITS.items) return [{ line, code: 'array_too_long', message: `${name} has ${value.length} items; the limit is ${LIMITS.items}` }];
    for (const item of value) {
      if (typeof item !== 'string') return [{ line, code: 'bad_type', message: `${name} must only contain strings` }];
      if (item.length > LIMITS.string) return [{ line, code: 'string_too_long', message: `${name} has an item of ${item.length} characters` }];
    }
    return [];
  }
  if (rule === 'string[][]') {
    if (!Array.isArray(value)) return [{ line, code: 'bad_type', message: `${name} must be a list of rows` }];
    if (value.length > LIMITS.items) return [{ line, code: 'array_too_long', message: `${name} has ${value.length} rows` }];
    for (const row of value) {
      if (!Array.isArray(row)) return [{ line, code: 'bad_type', message: `${name} must contain rows of strings` }];
      if (row.length > 20) return [{ line, code: 'array_too_long', message: `${name} has a row of ${row.length} cells; the limit is 20` }];
      for (const cell of row) {
        if (typeof cell !== 'string') return [{ line, code: 'bad_type', message: `${name} must only contain strings` }];
        if (cell.length > LIMITS.string) return [{ line, code: 'string_too_long', message: `${name} has a cell of ${cell.length} characters` }];
      }
    }
    return [];
  }
  if (rule === 'number[]') {
    if (!Array.isArray(value)) return [{ line, code: 'bad_type', message: `${name} must be a list of numbers` }];
    if (value.length > LIMITS.items) return [{ line, code: 'array_too_long', message: `${name} has ${value.length} values; the limit is ${LIMITS.items}` }];
    for (const item of value) {
      if (typeof item !== 'number' || !Number.isFinite(item)) return [{ line, code: 'bad_type', message: `${name} must only contain finite numbers` }];
    }
    return [];
  }
  if (Array.isArray(rule)) {
    if (typeof value !== 'string') return [{ line, code: 'bad_type', message: `${name} must be one of: ${rule.join(', ')}` }];
    if (!rule.includes(value)) return [{ line, code: 'bad_enum', message: `${name} must be one of: ${rule.join(', ')}` }];
    return [];
  }
  return [];
}

function checkArgs(statement, definition, line) {
  const errors = [];
  const { id, component, args } = statement;
  if (definition.children) {
    if (!Array.isArray(args)) {
      errors.push({ line, code: 'bad_args', message: `"${component}" takes a list of child ids, e.g. ${id} = ${component}([a, b])` });
      return errors;
    }
    if (args.length === 0) errors.push({ line, code: 'bad_args', message: `"${component}" needs at least one child` });
    for (const child of args) {
      if (typeof child !== 'string' || !ID.test(child)) {
        errors.push({ line, code: 'bad_ref', message: `"${id}" has a child that is not an id: ${JSON.stringify(child)}` });
      }
    }
    return errors;
  }
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    errors.push({ line, code: 'bad_args', message: `"${component}" takes one JSON object of props` });
    return errors;
  }
  for (const [key, value] of Object.entries(args)) {
    if (FORBIDDEN_PROPS.has(key.toLowerCase())) {
      errors.push({ line, code: 'forbidden_prop', message: `"${key}" is never allowed: a spec may not point a client at a URL, a script or a style` });
      continue;
    }
    const rule = definition.props[key];
    if (rule === undefined) {
      errors.push({ line, code: 'unknown_prop', message: `"${key}" is not a ${component} prop; allowed: ${Object.keys(definition.props).join(', ') || '(none)'}` });
      continue;
    }
    errors.push(...checkValue(`${component}.${key}`, value, rule, line));
  }
  return errors;
}

function childRefs(statement) {
  return Array.isArray(statement.args) ? statement.args.filter((child) => typeof child === 'string') : [];
}

/** @returns {Map<string, {id: string, component: string, args: any}>} */
function collect(spec, options) {
  const errors = [];
  const nodes = new Map();
  const order = [];
  const lines = spec.split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const raw = rawLine.trim();
    const line = index + 1;
    if (raw === '' || raw.startsWith('//') || raw.startsWith('#')) return;

    // Streaming: the last line of a growing answer is usually half-written. Dropping it
    // is not an error, it is "wait for the next chunk" — and it keeps a half-typed
    // forbidden prop from ever reaching the renderer.
    const isLastLine = index === lines.length - 1;
    const match = STATEMENT.exec(raw);
    if (!match) {
      if (!(options.partial && isLastLine)) errors.push({ line, code: 'syntax', message: 'expected `id = Component(args)` on one line' });
      return;
    }
    const [, id, component, rawArgs] = match;
    if (!ID.test(id)) {
      errors.push({ line, code: 'bad_id', message: `"${id}" is not an id (lowercase, digits, _, max 24, starting with a letter)` });
      return;
    }
    if (nodes.has(id)) {
      errors.push({ line, code: 'duplicate_id', message: `"${id}" is defined twice` });
      return;
    }
    const definition = COMPONENTS[component];
    if (!definition) {
      errors.push({ line, code: 'unknown_component', message: `"${component}" is not in the contract; allowed: ${Object.keys(COMPONENTS).join(', ')}` });
      return;
    }

    let args;
    if (definition.children) {
      const parsed = parseIds(rawArgs);
      if (parsed === null) {
        if (!(options.partial && isLastLine)) errors.push({ line, code: 'bad_ref', message: 'a layout takes a list of child ids, e.g. Stack([a, b])' });
        return;
      }
      args = parsed;
    } else {
      try {
        args = JSON.parse(rawArgs);
      } catch (error) {
        if (!(options.partial && isLastLine)) errors.push({ line, code: 'bad_json', message: `arguments are not valid JSON: ${error.message}` });
        return;
      }
    }

    const statement = { id, component, args };
    const argErrors = checkArgs(statement, definition, line);
    errors.push(...argErrors);
    if (argErrors.length === 0) {
      nodes.set(id, statement);
      order.push(statement);
    }
  });

  return { errors, nodes, order, lines };
}

function findCycle(nodes) {
  const done = new Set();
  const walk = (id, path) => {
    if (path.includes(id)) return [...path.slice(path.indexOf(id)), id];
    if (done.has(id)) return null;
    const statement = nodes.get(id);
    if (!statement) return null;
    for (const child of childRefs(statement)) {
      const found = walk(child, [...path, id]);
      if (found) return found;
    }
    done.add(id);
    return null;
  };
  for (const id of nodes.keys()) {
    const found = walk(id, []);
    if (found) return found;
  }
  return null;
}

/**
 * Validate a spec.
 * @param {string} spec
 * @param {{ maxNodes?: number, maxBytes?: number, partial?: boolean }} [options]
 */
export function validateSpec(spec, options = {}) {
  const maxNodes = Number.isFinite(options.maxNodes) ? Number(options.maxNodes) : LIMITS.nodes;
  const maxBytes = Number.isFinite(options.maxBytes) ? Number(options.maxBytes) : LIMITS.bytes;
  if (typeof spec !== 'string' || spec.trim() === '') {
    return { ok: false, errors: [{ line: 0, code: 'empty', message: 'the spec is empty' }], nodes: 0, canonical: '', order: [] };
  }
  // TextEncoder, not Buffer: this file runs in the plugin, in node --test and in the
  // browser bundle of the renderer, and Buffer only exists in two of those.
  if (new TextEncoder().encode(spec).length > maxBytes) {
    return { ok: false, errors: [{ line: 0, code: 'too_large', message: `the spec is over ${maxBytes} bytes` }], nodes: 0, canonical: '', order: [] };
  }

  const { errors, nodes, order, lines } = collect(spec, { partial: options.partial === true });
  const lineOf = (id) => lines.findIndex((line) => new RegExp(`^\\s*${id}\\s*=`).test(line)) + 1;

  if (nodes.size > maxNodes) errors.push({ line: 0, code: 'too_many_nodes', message: `${nodes.size} nodes; the limit is ${maxNodes}` });

  if (errors.length === 0 && options.partial !== true) {
    if (!nodes.has('root')) errors.push({ line: 0, code: 'no_root', message: 'a spec needs root = Stack([...]) or another component' });
    for (const statement of order) {
      for (const ref of childRefs(statement)) {
        if (!nodes.has(ref)) errors.push({ line: lineOf(statement.id), code: 'dangling_ref', message: `"${statement.id}" points at "${ref}", which is not defined` });
      }
    }
    const referenced = new Set(order.flatMap((statement) => childRefs(statement)));
    for (const statement of order) {
      if (statement.id !== 'root' && !referenced.has(statement.id)) {
        errors.push({ line: lineOf(statement.id), code: 'orphan', message: `"${statement.id}" is never referenced` });
      }
    }
    const cycle = findCycle(nodes);
    if (cycle) errors.push({ line: 0, code: 'cycle', message: `children form a cycle through ${cycle.join(' → ')}` });
  }

  if (errors.length > 0) return { ok: false, errors, nodes: nodes.size, canonical: '', order };
  return { ok: true, errors: [], nodes: nodes.size, canonical: canonicalise(order), order };
}

/** One statement per line, props sorted, root last: the canonical form must validate again. */
export function canonicalise(order) {
  const sorted = [...order].sort((a, b) => (a.id === 'root' ? 1 : b.id === 'root' ? -1 : a.id.localeCompare(b.id)));
  return sorted
    .map((statement) => {
      if (Array.isArray(statement.args)) return `${statement.id} = ${statement.component}([${statement.args.join(', ')}])`;
      const props = Object.fromEntries(Object.entries(statement.args).sort(([a], [b]) => a.localeCompare(b)));
      return `${statement.id} = ${statement.component}(${JSON.stringify(props)})`;
    })
    .join('\n');
}

/**
 * Build the drawable tree from `root`. In partial mode a missing root yields `null` and
 * unreachable children are skipped: the renderer keeps what is already complete.
 * @returns {null | {type: string, [key: string]: any}}
 */
export function buildTree(nodes, id = 'root', seen = new Set()) {
  if (seen.has(id)) return null;
  const statement = nodes.get(id);
  if (!statement) return null;
  const props = statement.args && !Array.isArray(statement.args) ? statement.args : {};
  const str = (key) => (typeof props[key] === 'string' ? props[key] : undefined);
  const flag = (key) => props[key] === true;
  const list = (key) => (Array.isArray(props[key]) ? props[key] : []);

  switch (statement.component) {
    case 'Stack':
      return { type: 'Stack', children: statement.args.map((child) => buildTree(nodes, child, new Set(seen))).filter(Boolean) };
    case 'Text':
      return { type: 'Paragraph', text: str('text') ?? '', variant: str('variant') ?? 'body', muted: flag('muted') };
    case 'Card':
      return { type: 'Card', title: str('title'), body: str('body'), tone: str('tone') ?? 'neutral' };
    case 'KeyValue':
      return { type: 'KeyValue', label: str('label') ?? '', value: str('value') ?? '', highlight: flag('highlight') };
    case 'Table':
      return { type: 'Table', columns: list('columns'), rows: list('rows'), caption: str('caption') };
    case 'List':
      return { type: 'Bullets', items: list('items'), ordered: flag('ordered') };
    case 'Stat':
      return { type: 'Stat', value: str('value') ?? '', label: str('label') ?? '', delta: str('delta'), tone: str('tone') ?? 'neutral' };
    case 'Code':
      return { type: 'Snippet', code: str('code') ?? '', language: str('language') ?? 'text', title: str('title') };
    case 'Chart':
      return {
        type: 'Chart',
        kind: str('kind') === 'line' ? 'line' : 'bar',
        labels: list('labels'),
        values: list('values'),
        title: str('title'),
        unit: str('unit'),
      };
    default:
      return null;
  }
}

/** One call for renderers: parse, then build, with an honest reason when it cannot draw. */
export function renderSpec(spec, options = {}) {
  const result = validateSpec(spec, options);
  if (!result.ok) return result;
  const nodes = new Map(result.order.map((statement) => [statement.id, statement]));
  return { ...result, tree: buildTree(nodes) };
}

export const EXAMPLE = [
  'root = Stack([title, counts, fleet, latency, snippet])',
  'title = Text({"text": "Fleet du matin", "variant": "h2"})',
  'counts = KeyValue({"label": "Équipiers en attente", "value": "2", "highlight": true})',
  'fleet = Table({"columns": ["Bot", "État", "Dernier passage"], "rows": [["CEO", "attente", "il y a 4 min"], ["Dev", "ok", "il y a 1 h"]]})',
  'latency = Chart({"kind": "line", "title": "Latence p95", "unit": "ms", "labels": ["09:00", "10:00", "11:00", "12:00"], "values": [180, 245, 210, 165]})',
  'snippet = Code({"language": "bash", "title": "Relancer l\'équipier", "code": "mercury bots restart ceo"})',
].join('\n');
