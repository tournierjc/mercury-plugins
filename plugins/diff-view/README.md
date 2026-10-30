# diff-view

Draws a ```diff fenced block as a coloured unified diff in the Mercury dashboard.

This plugin exists to prove a seam, not to be clever: it registers **no tool and no
command**. Its whole contribution is one renderer, declared in the manifest:

```json
"contributes": {
  "tools": [],
  "commands": [],
  "renderers": [
    { "language": "diff", "title": "Unified diff", "asset": "renderer/diff.html", "sandbox": "iframe" }
  ]
}
```

Mercury serves `renderer/diff.html` with `default-src 'none'; connect-src 'none'` and
draws it in `<iframe sandbox="allow-scripts">` wherever the answer contains a ```diff
fence. Nothing in the core knows what a diff is.

## Frame protocol (v1)

The host posts `{ v: 1, type: 'render', text, complete, theme }` — the *text* of the
fence and whether the answer is finished, never a parsed tree, so the language owns its
own incremental rules. The frame answers:

- `{ v: 1, type: 'ready' }` once, when it can receive;
- `{ v: 1, type: 'height', px }` after every draw (and on resize);
- `{ v: 1, type: 'error', message }` if it cannot draw.

Messages without `v: 1` are ignored. The file is a single self-contained HTML page: no
build step, no dependency, no network.

## Install

```bash
mercury plugins install ./diff-view
```

Requires Mercury with plugin API 1.3 (`contributes.renderers`).
