# The development roster

Four bots, one fleet for **Mercury itself**: a lead that cuts the work, two smiths that own
one repository each, and a reviewer that reads what they produced. The Android client has its
own fleet (`mac-lead`) — a change that touches both sides is two fleets talking to each other,
not one fleet spanning both. They are plain Mercury bots — a folder with
`bot.yaml`, `persona.md` and `permissions.yaml` — so nothing here is a new mechanism: this is
the fleet layout, written down and reproducible.

```
dev-lead                 the only bot you talk to
├── daemon-smith         mercury-agent      (TypeScript, the daemon and the dashboard)
├── plugin-smith         mercury-plugins    (plugin manifests and wire contracts)
└── reviewer             reads diffs, runs the suites, reports — never edits
```

## Install

```sh
scripts/install-roster.sh                       # into $MERCURY_HOME/bots, repos under ~/
scripts/install-roster.sh --root ~/code         # repos cloned under another folder
scripts/install-roster.sh --dry-run             # show what would be written
```

The script copies the bot folders, rewrites the repository scopes to your checkout paths,
rebuilds `roster.json` (the same fleet as one Mercury bundle, for the dashboard or the app),
and installs the plugins from this repository into `$MERCURY_HOME/plugins`. An existing bot
is never overwritten: a fleet you have been running is not a template.

## Why these five

- **One smith per repository** rather than one bot for everything. Each repository has its
  own rules — the Android app has its own release ladder, the daemon has a lint ratchet, a
  plugin is a single bundled file with no dependencies — and a bot that holds three sets of
  rules at once follows none of them.
- **The reviewer is separate, and cannot write.** A bot that reviews its own work reads its
  own intent back. `reviewer` has `write_file`, `edit_file` and the git write tools denied,
  so its only output is a report.
- **The lead has no repository.** It holds the goal, the order of the stages and the roster,
  which is exactly what a bot without path scopes can do.

## What the plugins add

`diff-view` and `openui-contract` are installed by the same script. They are what makes the
fleet readable in the dashboard: a ```diff fence from `daemon-smith` draws the patch, and an
`openui` fence draws a fleet table. Both require the plugin API 1.3 renderer seam — see the
repository README for the version that carries it.
