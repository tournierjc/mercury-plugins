// src/parse.js
var COMPONENTS = {
  Stack: { children: true, props: {} },
  Text: { props: { text: "string", variant: ["body", "h1", "h2", "h3", "mono"], muted: "boolean" } },
  Card: { props: { title: "string", body: "string", tone: ["neutral", "ok", "warn", "danger"] } },
  KeyValue: { props: { label: "string", value: "string", highlight: "boolean" } },
  Table: { props: { columns: "string[]", rows: "string[][]", caption: "string" } },
  List: { props: { items: "string[]", ordered: "boolean" } },
  Stat: { props: { label: "string", value: "string", delta: "string", tone: ["neutral", "ok", "warn", "danger"] } },
  Code: { props: { code: "code", language: "string", title: "string" } },
  Chart: { props: { kind: ["bar", "line"], labels: "string[]", values: "number[]", title: "string", unit: "string" } }
};
var FORBIDDEN_PROPS = /* @__PURE__ */ new Set([
  "href",
  "url",
  "uri",
  "src",
  "srcset",
  "html",
  "innerhtml",
  "script",
  "style",
  "onclick",
  "onload",
  "onerror",
  "action",
  "formaction",
  "image",
  "img",
  "svg",
  "iframe",
  "embed",
  "object",
  "data",
  "background",
  "class",
  "classname"
]);
var ID = /^[a-z][a-z0-9_]{0,23}$/;
var STATEMENT = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Z][A-Za-z0-9]*)\s*\(([\s\S]*)\)$/;
var LIMITS = { string: 1200, code: 4e3, items: 60, nodes: 60, bytes: 32768 };
function parseIds(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (inner === "") return [];
  return inner.split(",").map((part) => part.trim());
}
function checkValue(name, value, rule, line) {
  if (rule === "string") {
    if (typeof value !== "string") return [{ line, code: "bad_type", message: `${name} must be a string` }];
    if (value.length > LIMITS.string) return [{ line, code: "string_too_long", message: `${name} is ${value.length} characters; the limit is ${LIMITS.string}` }];
    return [];
  }
  if (rule === "code") {
    if (typeof value !== "string") return [{ line, code: "bad_type", message: `${name} must be a string` }];
    if (value.length > LIMITS.code) return [{ line, code: "string_too_long", message: `${name} is ${value.length} characters; the limit is ${LIMITS.code}` }];
    return [];
  }
  if (rule === "boolean") {
    if (typeof value !== "boolean") return [{ line, code: "bad_type", message: `${name} must be true or false` }];
    return [];
  }
  if (rule === "string[]") {
    if (!Array.isArray(value)) return [{ line, code: "bad_type", message: `${name} must be a list of strings` }];
    if (value.length > LIMITS.items) return [{ line, code: "array_too_long", message: `${name} has ${value.length} items; the limit is ${LIMITS.items}` }];
    for (const item of value) {
      if (typeof item !== "string") return [{ line, code: "bad_type", message: `${name} must only contain strings` }];
      if (item.length > LIMITS.string) return [{ line, code: "string_too_long", message: `${name} has an item of ${item.length} characters` }];
    }
    return [];
  }
  if (rule === "string[][]") {
    if (!Array.isArray(value)) return [{ line, code: "bad_type", message: `${name} must be a list of rows` }];
    if (value.length > LIMITS.items) return [{ line, code: "array_too_long", message: `${name} has ${value.length} rows` }];
    for (const row of value) {
      if (!Array.isArray(row)) return [{ line, code: "bad_type", message: `${name} must contain rows of strings` }];
      if (row.length > 20) return [{ line, code: "array_too_long", message: `${name} has a row of ${row.length} cells; the limit is 20` }];
      for (const cell of row) {
        if (typeof cell !== "string") return [{ line, code: "bad_type", message: `${name} must only contain strings` }];
        if (cell.length > LIMITS.string) return [{ line, code: "string_too_long", message: `${name} has a cell of ${cell.length} characters` }];
      }
    }
    return [];
  }
  if (rule === "number[]") {
    if (!Array.isArray(value)) return [{ line, code: "bad_type", message: `${name} must be a list of numbers` }];
    if (value.length > LIMITS.items) return [{ line, code: "array_too_long", message: `${name} has ${value.length} values; the limit is ${LIMITS.items}` }];
    for (const item of value) {
      if (typeof item !== "number" || !Number.isFinite(item)) return [{ line, code: "bad_type", message: `${name} must only contain finite numbers` }];
    }
    return [];
  }
  if (Array.isArray(rule)) {
    if (typeof value !== "string") return [{ line, code: "bad_type", message: `${name} must be one of: ${rule.join(", ")}` }];
    if (!rule.includes(value)) return [{ line, code: "bad_enum", message: `${name} must be one of: ${rule.join(", ")}` }];
    return [];
  }
  return [];
}
function checkArgs(statement, definition, line) {
  const errors = [];
  const { id, component, args } = statement;
  if (definition.children) {
    if (!Array.isArray(args)) {
      errors.push({ line, code: "bad_args", message: `"${component}" takes a list of child ids, e.g. ${id} = ${component}([a, b])` });
      return errors;
    }
    if (args.length === 0) errors.push({ line, code: "bad_args", message: `"${component}" needs at least one child` });
    for (const child of args) {
      if (typeof child !== "string" || !ID.test(child)) {
        errors.push({ line, code: "bad_ref", message: `"${id}" has a child that is not an id: ${JSON.stringify(child)}` });
      }
    }
    return errors;
  }
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    errors.push({ line, code: "bad_args", message: `"${component}" takes one JSON object of props` });
    return errors;
  }
  for (const [key, value] of Object.entries(args)) {
    if (FORBIDDEN_PROPS.has(key.toLowerCase())) {
      errors.push({ line, code: "forbidden_prop", message: `"${key}" is never allowed: a spec may not point a client at a URL, a script or a style` });
      continue;
    }
    const rule = definition.props[key];
    if (rule === void 0) {
      errors.push({ line, code: "unknown_prop", message: `"${key}" is not a ${component} prop; allowed: ${Object.keys(definition.props).join(", ") || "(none)"}` });
      continue;
    }
    errors.push(...checkValue(`${component}.${key}`, value, rule, line));
  }
  return errors;
}
function childRefs(statement) {
  return Array.isArray(statement.args) ? statement.args.filter((child) => typeof child === "string") : [];
}
function collect(spec, options) {
  const errors = [];
  const nodes = /* @__PURE__ */ new Map();
  const order = [];
  const lines = spec.split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const raw = rawLine.trim();
    const line = index + 1;
    if (raw === "" || raw.startsWith("//") || raw.startsWith("#")) return;
    const isLastLine = index === lines.length - 1;
    const match = STATEMENT.exec(raw);
    if (!match) {
      if (!(options.partial && isLastLine)) errors.push({ line, code: "syntax", message: "expected `id = Component(args)` on one line" });
      return;
    }
    const [, id, component, rawArgs] = match;
    if (!ID.test(id)) {
      errors.push({ line, code: "bad_id", message: `"${id}" is not an id (lowercase, digits, _, max 24, starting with a letter)` });
      return;
    }
    if (nodes.has(id)) {
      errors.push({ line, code: "duplicate_id", message: `"${id}" is defined twice` });
      return;
    }
    const definition = COMPONENTS[component];
    if (!definition) {
      errors.push({ line, code: "unknown_component", message: `"${component}" is not in the contract; allowed: ${Object.keys(COMPONENTS).join(", ")}` });
      return;
    }
    let args;
    if (definition.children) {
      const parsed = parseIds(rawArgs);
      if (parsed === null) {
        if (!(options.partial && isLastLine)) errors.push({ line, code: "bad_ref", message: "a layout takes a list of child ids, e.g. Stack([a, b])" });
        return;
      }
      args = parsed;
    } else {
      try {
        args = JSON.parse(rawArgs);
      } catch (error) {
        if (!(options.partial && isLastLine)) errors.push({ line, code: "bad_json", message: `arguments are not valid JSON: ${error.message}` });
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
  const done = /* @__PURE__ */ new Set();
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
function validateSpec(spec, options = {}) {
  const maxNodes = Number.isFinite(options.maxNodes) ? Number(options.maxNodes) : LIMITS.nodes;
  const maxBytes = Number.isFinite(options.maxBytes) ? Number(options.maxBytes) : LIMITS.bytes;
  if (typeof spec !== "string" || spec.trim() === "") {
    return { ok: false, errors: [{ line: 0, code: "empty", message: "the spec is empty" }], nodes: 0, canonical: "", order: [] };
  }
  if (new TextEncoder().encode(spec).length > maxBytes) {
    return { ok: false, errors: [{ line: 0, code: "too_large", message: `the spec is over ${maxBytes} bytes` }], nodes: 0, canonical: "", order: [] };
  }
  const { errors, nodes, order, lines } = collect(spec, { partial: options.partial === true });
  const lineOf = (id) => lines.findIndex((line) => new RegExp(`^\\s*${id}\\s*=`).test(line)) + 1;
  if (nodes.size > maxNodes) errors.push({ line: 0, code: "too_many_nodes", message: `${nodes.size} nodes; the limit is ${maxNodes}` });
  if (errors.length === 0 && options.partial !== true) {
    if (!nodes.has("root")) errors.push({ line: 0, code: "no_root", message: "a spec needs root = Stack([...]) or another component" });
    for (const statement of order) {
      for (const ref of childRefs(statement)) {
        if (!nodes.has(ref)) errors.push({ line: lineOf(statement.id), code: "dangling_ref", message: `"${statement.id}" points at "${ref}", which is not defined` });
      }
    }
    const referenced = new Set(order.flatMap((statement) => childRefs(statement)));
    for (const statement of order) {
      if (statement.id !== "root" && !referenced.has(statement.id)) {
        errors.push({ line: lineOf(statement.id), code: "orphan", message: `"${statement.id}" is never referenced` });
      }
    }
    const cycle = findCycle(nodes);
    if (cycle) errors.push({ line: 0, code: "cycle", message: `children form a cycle through ${cycle.join(" \u2192 ")}` });
  }
  if (errors.length > 0) return { ok: false, errors, nodes: nodes.size, canonical: "", order };
  return { ok: true, errors: [], nodes: nodes.size, canonical: canonicalise(order), order };
}
function canonicalise(order) {
  const sorted = [...order].sort((a, b) => a.id === "root" ? 1 : b.id === "root" ? -1 : a.id.localeCompare(b.id));
  return sorted.map((statement) => {
    if (Array.isArray(statement.args)) return `${statement.id} = ${statement.component}([${statement.args.join(", ")}])`;
    const props = Object.fromEntries(Object.entries(statement.args).sort(([a], [b]) => a.localeCompare(b)));
    return `${statement.id} = ${statement.component}(${JSON.stringify(props)})`;
  }).join("\n");
}
var EXAMPLE = [
  "root = Stack([title, counts, fleet, latency, snippet])",
  'title = Text({"text": "Fleet du matin", "variant": "h2"})',
  'counts = KeyValue({"label": "\xC9quipiers en attente", "value": "2", "highlight": true})',
  'fleet = Table({"columns": ["Bot", "\xC9tat", "Dernier passage"], "rows": [["CEO", "attente", "il y a 4 min"], ["Dev", "ok", "il y a 1 h"]]})',
  'latency = Chart({"kind": "line", "title": "Latence p95", "unit": "ms", "labels": ["09:00", "10:00", "11:00", "12:00"], "values": [180, 245, 210, 165]})',
  `snippet = Code({"language": "bash", "title": "Relancer l'\xE9quipier", "code": "mercury bots restart ceo"})`
].join("\n");

// src/index.js
async function activate(ctx) {
  const maxNodes = () => {
    const value = Number(ctx.settings.get("max_nodes") ?? 60);
    return Number.isFinite(value) && value > 0 ? Math.min(value, 200) : 60;
  };
  ctx.tools.register({
    name: "render_ui",
    description: "Validate an OpenUI Lang spec before showing it to the user. Returns the canonical spec on success, or the exact errors to fix. Then emit the validated spec inside a ```openui fenced block: clients that can render it will, the others show the code.",
    inputSchema: {
      type: "object",
      properties: {
        spec: { type: "string", description: "OpenUI Lang, one statement per line, e.g. root = Stack([a, b])" }
      },
      required: ["spec"]
    },
    execute: async (args) => {
      const result = validateSpec(String(args?.spec ?? ""), { maxNodes: maxNodes() });
      if (!result.ok) {
        ctx.log.debug("rejected a spec", { errors: result.errors.length });
        return JSON.stringify({ ok: false, errors: result.errors.slice(0, 20), nodes: result.nodes }, null, 2);
      }
      return JSON.stringify({ ok: true, nodes: result.nodes, spec: result.canonical }, null, 2);
    }
  });
  ctx.commands.register({
    name: "openui_contract",
    run: async (args, io) => {
      if (String(args || "").trim() === "example") {
        await io.reply("```openui\n" + EXAMPLE + "\n```");
        return;
      }
      const lines = Object.entries(COMPONENTS).map(([name, definition]) => {
        const props = Object.keys(definition.props);
        return `- ${name}: ${definition.children ? "children only" : props.length ? props.join(", ") : "(no props)"}`;
      });
      await io.reply(["OpenUI Lang v1 \u2014 components a client must render:", ...lines, "", "Example: /openui_contract example"].join("\n"));
    }
  });
  ctx.log.info("activated", { components: Object.keys(COMPONENTS).length });
}
var contract = { COMPONENTS, validateSpec, EXAMPLE };
async function deactivate() {
}
export {
  activate,
  contract,
  deactivate,
  validateSpec
};
