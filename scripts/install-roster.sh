#!/usr/bin/env bash
# Install the development roster into a Mercury home.
#
# What it writes (and nothing else):
#   $MERCURY_HOME/bots/dev-lead/{bot.yaml,persona.md,permissions.yaml}
#   $MERCURY_HOME/bots/dev-lead/<crew>/{bot.yaml,persona.md,permissions.yaml}   (4 of them)
#   $MERCURY_HOME/plugins/<id>/<version>/                                        (plugins installed)
#
# An existing bot directory is never touched: a fleet someone has been running
# has state in it (journal, transcripts, sandbox) that a template must not
# overwrite.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$HERE")"
ROOT="${HOME}"
DRY_RUN=0
SKIP_PLUGINS=0
MERCURY_HOME="${MERCURY_HOME:-$HOME/.mercury}"

usage() {
  cat <<'USAGE'
Usage: install-roster.sh [options]

  --root <dir>     Where the repositories are cloned (default: $HOME).
                   The bots' path scopes are rewritten to <dir>/<repo>.
  --home <dir>     Mercury home to install into (default: $MERCURY_HOME or ~/.mercury).
  --no-plugins     Skip installing the plugins from this repository.
  --dry-run        Print what would be written, change nothing.
  -h, --help       This message.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="${2:?--root needs a directory}"; shift 2 ;;
    --home) MERCURY_HOME="${2:?--home needs a directory}"; shift 2 ;;
    --no-plugins) SKIP_PLUGINS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

ROOT="${ROOT/#\~/$HOME}"
MERCURY_HOME="${MERCURY_HOME/#\~/$HOME}"
BOTS="$MERCURY_HOME/bots"
LEAD="dev-lead"

[ -d "$REPO/roster/bots" ] || { echo "No roster/bots next to this script ($REPO)." >&2; exit 1; }

echo "Mercury home : $MERCURY_HOME"
echo "Repositories : $ROOT"
echo

# The lead first: a crew bot's folder lives inside its lead's folder, so the
# parent has to exist before any child is written.
install_bot() {
  local id="$1" dest="$2"
  if [ -d "$dest" ]; then
    echo "  = $id — already there, left alone"
    return
  fi
  echo "  + $id → ${dest#"$MERCURY_HOME"/}"
  [ "$DRY_RUN" = 1 ] && return
  mkdir -p "$dest"
  sed "s|__ROOT__|$ROOT|g" "$REPO/roster/bots/$id/permissions.yaml" > "$dest/permissions.yaml"
  cp "$REPO/roster/bots/$id/bot.yaml" "$REPO/roster/bots/$id/persona.md" "$dest/"
  chmod 600 "$dest/permissions.yaml" 2>/dev/null || true
}

echo "Bots:"
install_bot "$LEAD" "$BOTS/$LEAD"
for dir in "$REPO"/roster/bots/*/; do
  id="$(basename "$dir")"
  [ "$id" = "$LEAD" ] && continue
  install_bot "$id" "$BOTS/$LEAD/$id"
done

if [ "$DRY_RUN" = 0 ]; then
  echo
  echo "Bundle:"
  node "$REPO/scripts/roster.mjs" | sed 's/^/  /'
fi

if [ "$SKIP_PLUGINS" = 0 ]; then
  echo
  echo "Plugins:"
  if [ ! -d "$REPO/dist" ] || [ -z "$(ls -A "$REPO/dist" 2>/dev/null)" ]; then
    if [ "$DRY_RUN" = 0 ]; then
      node "$REPO/scripts/build.mjs" >/dev/null
      node "$REPO/scripts/pack.mjs" >/dev/null
    fi
  fi
  for archive in "$REPO"/dist/*.tgz; do
    [ -e "$archive" ] || continue
    name="$(basename "$archive" .tgz)"
    if [ "$DRY_RUN" = 1 ]; then
      echo "  → would install $name"
    elif command -v mercury >/dev/null 2>&1; then
      echo "  → $name"
      MERCURY_HOME="$MERCURY_HOME" mercury plugins install "$archive" || \
        echo "    ! refused — this Mercury may predate the renderer seam (Plugin API 1.3)"
    else
      echo "  ! mercury not on PATH: install by hand → mercury plugins install $archive"
    fi
  done
fi

echo
if [ "$DRY_RUN" = 1 ]; then
  echo "Dry run: nothing was written."
else
  echo "Done. In Mercury: /bots to see the fleet, then message $LEAD."
fi
