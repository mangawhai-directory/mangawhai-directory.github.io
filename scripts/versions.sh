#!/usr/bin/env bash
# One Hugo and one Node, everywhere the site is built.
#
#   scripts/versions.sh          compare this machine and every workflow against
#                                the deploy workflow; exit 1 on any mismatch
#   scripts/versions.sh hugo     print the Hugo version the deploy uses
#   scripts/versions.sh node     print the Node major version the deploy uses
#
# The deploy workflow (.github/workflows/hugo.yaml) is the source of truth,
# because it is what builds the live site. Everything else is compared to it:
# this machine's hugo and node, and the node-version in every other workflow.
# The test workflow installs Hugo by asking this script, so it cannot drift.
#
# Why it matters here: hugo.toml's [security.exec] list had to change for Hugo
# 0.165 (tailwindcss was dropped from the defaults), and the Tailwind pipeline
# needs Node. A local build on another version can pass while the deploy fails,
# or the other way round.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$REPO/.github/workflows/hugo.yaml"

[ -f "$DEPLOY" ] || { echo "versions: $DEPLOY not found" >&2; exit 2; }

want_hugo="$(sed -n 's/^ *HUGO_VERSION: *["'\'']\{0,1\}\([0-9][0-9.]*\).*/\1/p' "$DEPLOY" | head -1)"
want_node="$(sed -n 's/^ *node-version: *["'\'']\{0,1\}\([0-9][0-9]*\).*/\1/p' "$DEPLOY" | head -1)"
if grep -q 'hugo_extended_' "$DEPLOY"; then want_ed=extended; else want_ed=standard; fi

case "${1:-}" in
  hugo) [ -n "$want_hugo" ] || exit 2; echo "$want_hugo"; exit 0 ;;
  node) [ -n "$want_node" ] || exit 2; echo "$want_node"; exit 0 ;;
  "") ;;
  *) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac

green=$'\033[32m'; red=$'\033[31m'; yellow=$'\033[33m'; off=$'\033[0m'
bad=0
ok()   { printf '  %s✓%s %s\n' "$green" "$off" "$*"; }
no()   { printf '  %s✗%s %s\n' "$red" "$off" "$*"; bad=1; }
warn() { printf '  %s!%s %s\n' "$yellow" "$off" "$*"; }

[ -n "$want_hugo" ] || no "could not read HUGO_VERSION from $DEPLOY"
[ -n "$want_node" ] || no "could not read node-version from $DEPLOY"
[ "$bad" = 0 ] || exit 1
ok "deploy builds with Hugo $want_hugo ($want_ed) and Node $want_node"

# This machine ---------------------------------------------------------------
if command -v hugo >/dev/null 2>&1; then
  line="$(hugo version 2>/dev/null)"
  have="$(sed -n 's/^hugo v\([0-9][0-9.]*\).*/\1/p' <<<"$line")"
  case "$line" in *+extended*) have_ed=extended ;; *) have_ed=standard ;; esac
  if [ "$have" = "$want_hugo" ] && [ "$have_ed" = "$want_ed" ]; then
    ok "hugo here: $have ($have_ed)"
  else
    no "hugo here is ${have:-unknown} ($have_ed); the deploy uses $want_hugo ($want_ed)"
  fi
else
  no "hugo is not installed (the deploy uses $want_hugo $want_ed)"
fi

if command -v node >/dev/null 2>&1; then
  have="$(node --version | sed 's/^v\([0-9]*\).*/\1/')"
  if [ "$have" = "$want_node" ]; then ok "node here: $(node --version)"
  else no "node here is $(node --version); the deploy uses Node $want_node"; fi
else
  no "node is not installed (the deploy uses Node $want_node)"
fi

# Every other workflow ---------------------------------------------------------
for wf in "$REPO"/.github/workflows/*.y*ml; do
  [ "$wf" = "$DEPLOY" ] && continue
  name="${wf#"$REPO"/}"
  while read -r v; do
    [ -n "$v" ] || continue
    if [ "$v" = "$want_node" ]; then ok "$name: Node $v"
    else no "$name uses Node $v; the deploy uses Node $want_node"; fi
  done < <(sed -n 's/^ *node-version: *["'\'']\{0,1\}\([0-9][0-9]*\).*/\1/p' "$wf")
  if grep -qE 'HUGO_VERSION: *[0-9]' "$wf"; then
    no "$name pins its own HUGO_VERSION; read it with scripts/versions.sh hugo instead"
  fi
done

# The devcontainer is not part of any build, so it only warns.
dc="$REPO/.devcontainer/devcontainer.json"
if [ -f "$dc" ] && grep -qE '"version": *"(latest|lts)"' "$dc"; then
  warn ".devcontainer/devcontainer.json installs Hugo/Node by 'latest'/'lts', not $want_hugo / $want_node"
fi

exit "$bad"
