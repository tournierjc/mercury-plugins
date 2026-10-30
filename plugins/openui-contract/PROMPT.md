# The prompt side

The plugin and the contract decide *what may be rendered*. Nothing renders until the model is told it
may answer with a block — so this is the missing half, and it is deliberately a paste, not code: it
belongs in a bot's persona or a project instruction, where the owner can tune it per agent.

## Paste this where your agent reads its instructions

```
When a structured answer helps more than prose — a fleet state, a comparison, a short table of
results — you may answer with one fenced block tagged openui, using OpenUI Lang v1:

    root = Stack([title, table1])
    title = Text({"text": "Fleet", "variant": "h2"})
    table1 = Table({"columns": ["Bot", "État"], "rows": [["CEO", "attente"]]})

Allowed components: Stack (children only), Text, Card, KeyValue, Table, List, Stat.
Call the tool openui-contract__render_ui with your spec first. If it returns ok:true, emit the
returned spec verbatim inside the fence. If it returns errors, fix what they name and call again —
or answer in prose instead. Never invent a component, and never put a URL, a script or a style in a
spec.
```

## What that buys, and what it costs

- The model self-corrects against the validator instead of shipping a spec a client will refuse: one
  extra tool round-trip per answer that contains UI.
- A message with a bad spec still arrives — as fenced code the user can read. That is the point of
  the fallback rule, and why the prompt says "or answer in prose".
- The tool is read-only and offline: a spec cannot make Mercury fetch anything.
