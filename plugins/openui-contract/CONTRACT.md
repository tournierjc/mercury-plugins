# OpenUI Lang, as Mercury speaks it — v1

The contract a Mercury client needs to implement to render a dynamic answer, and the
only thing `openui-contract` enforces. The plugin cannot draw: Mercury's plugin API has
no UI contribution point. It validates, so a dashboard and a phone can be strict about
what they are handed.

## Transport: a fenced block

The model emits one fenced block, fence language `openui`, inside an otherwise normal
answer:

    Voici l'état de l'équipe ce matin.

    ```openui
    root = Stack([title, counts, fleet])
    title = Text({"text": "Fleet du matin", "variant": "h2"})
    counts = KeyValue({"label": "Équipiers en attente", "value": "2", "highlight": true})
    fleet = Table({"columns": ["Bot", "État"], "rows": [["CEO", "attente"], ["Dev", "ok"]]})
    ```

Rules for the transport:

- **One `openui` block per message.** A second one is rendered as code.
- Text outside the block is ordinary prose and is shown as-is: the block never replaces
  the answer, it sits inside it.
- A client that cannot render must show the block's source verbatim (a code block). That
  is the whole fallback, and it must never be silent: a user who sees raw
  `root = Stack(...)` knows why when the version is older.
- A client that can render and **fails** to parse a spec must fall back to the code
  block for that message, not to white space.

## Grammar

One statement per line:

    id = Component(args)

- `id`: `^[a-z][a-z0-9_]{0,23}$`, unique. `root` is the entry point.
- `Component`: one of the allowlisted components, capitalised.
- `args`: either one JSON object (props) or one JSON array of child ids (layout only).
- Blank lines, `//` and `#` comments are ignored.
- Everything on one line: a spec is parsed line by line, so a statement that wraps is
  a syntax error rather than a guess.

## Components — the v1 allowlist

A client must render all nine, and nothing else. `renderer/preview.html` is the reference rendering:
open it with `?spec=<base64url>` to see what a captured answer should look like.

- **Stack** — layout only, no props: `Stack([a, b, c])`. Children render in order.
- **Text** — `text` (string), `variant` (`body` | `h1` | `h2` | `h3` | `mono`), `muted` (boolean).
- **Card** — `title`, `body` (strings), `tone` (`neutral` | `ok` | `warn` | `danger`).
- **KeyValue** — `label`, `value` (strings), `highlight` (boolean).
- **Table** — `columns` (list of strings), `rows` (list of lists of strings), `caption`.
- **List** — `items` (list of strings), `ordered` (boolean).
- **Stat** — `label`, `value`, `delta` (strings), `tone` (`neutral` | `ok` | `warn` | `danger`).
- **Code** — `code` (string, up to 4000 characters), `language`, `title`.
- **Chart** — `kind` (`bar` | `line`), `labels` (list of strings), `values` (list of **numbers**),
  `title`, `unit`. One series: a multi-series chart is a different design, not a wider prop.

Forms, buttons and anything interactive are **v2**: a model that tries one gets `unknown_component`
and can correct itself. Interactive components are the ones that turn a rendering bug into a
security question, and they need their own design.

## What is never allowed

A spec is untrusted output. These are rejected, whole-spec, with no partial rendering:

- **Properties that point somewhere**: `href`, `url`, `uri`, `src`, `srcset`, `action`,
  `formaction`, `image`, `img`, `svg`, `iframe`, `embed`, `object`, `data`, `background`.
- **Properties that execute or style**: `html`, `innerHTML`, `script`, `style`, `class`,
  `className`, `onClick`, `onLoad`, `onError`.
- **Unknown components or props.** Fail closed: a client that renders what it does not
  understand is a client that can be made to render anything.
- `root` missing, a reference to an id that does not exist, an id nobody references
  (an orphan), or a cycle through children.

## Limits

- Spec ≤ 32 kB, ≤ 60 components (`max_nodes` setting, capped at 200).
- A string prop ≤ 1200 characters, a code body ≤ 4000, a list ≤ 60 items, a table row ≤ 20 cells.
- `Chart.values` must hold finite numbers: `"12"` is refused, because a renderer that has to parse
  strings is a renderer that will one day draw `NaN`.
- A message carries at most one spec.

## Canonical form

`render_ui` returns the spec with props sorted by key and `root` last, one statement per
line. Two clients handed the same spec get the same bytes — which is what makes a
rendering difference a bug report instead of a mystery.

## How a model is meant to use it

1. Build the spec, call `render_ui({ spec })`.
2. On `ok: true`, emit the returned `spec` inside the `openui` fence.
3. On `ok: false`, fix what the errors name and call again — or drop the UI and answer in
   prose. A model that cannot produce a valid spec must not invent one.

## Versioning

The fence name is the version: `openui` is v1, forever. A v2 that changes the grammar
needs a new fence (`openui2`), because an old client cannot tell one dialect from another
inside the same block. Adding components is a contract change, not a version change: a
client advertises which it renders, and a model that emits a component a client lacks
gets the code block.
