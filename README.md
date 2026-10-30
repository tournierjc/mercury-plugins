# mercury-plugins

Mercury plugins, and the development roster that runs them.

Two things live here, and they share one install path:

- **`plugins/`** — the plugins themselves. One folder each, one manifest each, one bundled
  entry module each. No dependencies: an in-process plugin is loaded into Mercury's own
  binary, which cannot resolve packages on its behalf.
- **`roster/`** — the development fleet (a lead, three smiths, a reviewer) as plain Mercury
  bot folders, plus the bundle form of the same fleet.

## Install the plugins

From the catalog this repository publishes:

```sh
export MERCURY_PLUGIN_CATALOG_URL=https://raw.githubusercontent.com/tournierjc/mercury-plugins/main/catalog.json
mercury plugins search diff
mercury plugins install diff-view
```

Or straight from a local checkout, without waiting for a release:

```sh
node scripts/build.mjs && node scripts/pack.mjs
mercury plugins install dist/diff-view-0.1.0.tgz
```

`catalog.json` is generated from the packed archives — every entry carries the SHA-256 and
the size of the bytes at its release URL, and Mercury refuses a download that does not match.
It is never edited by hand; CI fails when it drifts from the plugins.

## The plugins

- **`diff-view`** — draws a ```diff fence as a coloured unified diff. It registers no tool and
  no command: its whole contribution is one renderer.
- **`openui-contract`** — validates OpenUI Lang v1 specs (a tool, `render_ui`, plus the
  `/openui_contract` command for the allowlist) and draws an ```openui fence through its own
  renderer and parser.

Both need the **renderer seam, Plugin API 1.3** (`contributes.renderers`). Mercury 1.4.2 ships
1.2.0 and refuses these manifests with `Unrecognized key(s) in object: 'renderers'`; the seam
is proposed upstream. A plugin that only contributes tools or commands does not need it.

## Layout

```
plugins/<id>/               mercury-plugin.json, index.mjs, renderer/, README.md
scripts/build.mjs           runs each plugin's own build (openui compiles src/ → index.mjs)
scripts/test.mjs            runs each plugin's test/*.test.mjs under node:test
scripts/pack.mjs            dist/<id>-<version>.tgz, npm-pack shaped
scripts/catalog.mjs         regenerates catalog.json from the archives
scripts/verify.mjs          the checks Mercury's installer makes, before a release exists
roster/                     the development fleet
```

## Releasing a plugin

One tag per plugin version, and the tag carries the version the manifest carries:

```sh
# bump plugins/<id>/mercury-plugin.json, then
node scripts/build.mjs && node scripts/pack.mjs && node scripts/catalog.mjs
git commit -am "feat(<id>): …" && git push
git tag <id>-v<version> && git push origin <id>-v<version>
```

`release.yml` attaches `<id>-<version>.tgz` to that tag; `catalog.json` already points there,
so the two cannot disagree — the workflow fails if the catalog and the tag do.

## The roster

See [`roster/README.md`](roster/README.md). In short:

```sh
scripts/install-roster.sh --root ~/code
```

writes the five bots into `$MERCURY_HOME/bots`, points their scopes at your checkouts, and
installs the plugins from this repository. An existing bot is never overwritten.
