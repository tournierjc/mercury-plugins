# OpenUI Contract

Validates **OpenUI Lang** specs for Mercury, so a client only ever renders what the contract allows.

Mercury's plugin API has no UI contribution point — a plugin cannot draw anything in the dashboard or
in the Android app. What it *can* do is give the model a tool that checks a spec before a client is
handed it, and give the owner a way to see the rules. That is this plugin:

- **tool `render_ui({ spec })`** — validates a spec, returns the canonical form plus its node count, or
  the exact errors with their line numbers. The model then emits the validated spec in a
  ```` ```openui ```` fenced block.
- **command `/openui_contract`** — the v1 component allowlist; `/openui_contract example` prints a spec
  that passes.

The rules themselves — grammar, the nine components, forbidden props, limits, fallback — are in
[CONTRACT.md](CONTRACT.md). That file is the specification; `index.mjs` is its only implementation.

## Reference rendering

`renderer/preview.html` is a zero-dependency client: open it in a browser and it parses a spec and
draws the nine components (table, chart as inline SVG, syntax-highlighted code, cards, stats). Pass a
captured answer with `?spec=<base64url>` to check what a message should look like. It is the visual
half of the contract — the thing a React or Compose implementation is measured against, not a
component library to ship.

## Why validation lives here and not in the client

A client that renders what it does not understand can be made to render anything. Two clients (a React
dashboard and a Compose app) writing their own lenient parsers would drift apart in exactly the cases
that matter. So the contract is enforced once, where the model can be told to fix it, and the clients
are written strict: a spec that fails to parse shows as code, never as a half-drawn screen.

## Develop

```sh
mercury plugins validate .          # checks it the way Mercury will run it
mercury plugins install . --yes     # install this folder into your Mercury
mercury plugins info openui-contract
```

Setting: `max_nodes` (default 60, capped at 200) — how many components one spec may contain.

Edit, then run `mercury plugins install . --yes` again; bump `version` in `mercury-plugin.json` first.

## Test

```sh
node --test          # 27 tests: the validator, and activate() driven through a stub context
```

## Publish

```sh
mercury plugins pack .              # writes openui-contract-<version>.tgz and its catalog entry
```

## Limits, stated plainly

- This plugin does not stream, render, or touch the message: it only answers a tool call. Making the
  block appear in an answer is the model's prompt and the client's renderer.
- Charts, forms and anything interactive are v2 by design: an interactive component is where a
  rendering bug becomes a security question, and it needs its own decisions first.
- `render_ui` is `readOnly`: it validates a string and returns text. It reads no file, and the
  manifest declares no network host — the context here cannot reach the network at all.

## Contract

- Plugin API 1.2.0 (types in `mercury-plugin.d.ts`). Minor versions only add.
- No dependencies on other plugins.
- Renamed or removed a setting? Bump `settings.version` and add a `settings.migrations` step.
