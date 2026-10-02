#!/usr/bin/env bash
# Mangawhai Directory — from a fresh clone to a passing `make test`.
#
#   make setup            do every step, stopping at the first thing only you can do
#   make check            check every step, change nothing
#
# Idempotent: each step sees what is already done and skips it.
#
# The site builds and runs on this machine. There is no container, no database
# and no server to start. You need git, Hugo (the version and edition the deploy
# uses), Node (the same major version) and Python 3, which runs the site checks.
#
# What you end up with:
#   • the Node packages the build needs (Tailwind), in node_modules/
#   • the Node packages the listing validator needs, in scripts/node_modules/
#   • a report on the helper checkout and task-tracker access, which only
#     maintainers' helper agents use
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

CHECK_ONLY=0
for a in "$@"; do case "$a" in
  --check) CHECK_ONLY=1 ;;
  -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) printf 'unknown flag: %s\n' "$a" >&2; exit 2 ;;
esac; done

bold=$'\033[1m'; green=$'\033[32m'; red=$'\033[31m'; yellow=$'\033[33m'; dim=$'\033[2m'; off=$'\033[0m'
step() { printf '\n%s%s%s\n' "$bold" "$*" "$off"; }
ok()   { printf '  %s✓%s %s\n' "$green" "$off" "$*"; }
no()   { printf '  %s✗%s %s\n' "$red" "$off" "$*"; }
warn() { printf '  %s!%s %s\n' "$yellow" "$off" "$*"; }
hint() { printf '    %s%s%s\n' "$dim" "$*" "$off"; }

BLOCKED=0
block() { no "$1"; shift; for l in "$@"; do hint "$l"; done; BLOCKED=1; }
stop_if_blocked() {
  [ "$BLOCKED" = 1 ] || return 0
  printf '\n%sNot finished.%s Fix the ✗ items above and run %smake %s%s again.\n' \
    "$bold" "$off" "$bold" "$([ "$CHECK_ONLY" = 1 ] && echo check || echo setup)" "$off"
  exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
step "1. Tools"

for b in git hugo node npm python3; do
  if command -v "$b" >/dev/null 2>&1; then ok "$b"
  else block "$b missing" "install it, then re-run"; fi
done
stop_if_blocked

# ─────────────────────────────────────────────────────────────────────────────
step "2. Versions (must match the deploy)"

"$REPO/scripts/versions.sh" | cat
if [ "${PIPESTATUS[0]}" != 0 ]; then
  block "this machine or a workflow does not build with what the deploy builds with" \
    "install Hugo $("$REPO/scripts/versions.sh" hugo) extended and Node $("$REPO/scripts/versions.sh" node)," \
    "or change .github/workflows/hugo.yaml first if the deploy is what should move"
fi
stop_if_blocked

# ─────────────────────────────────────────────────────────────────────────────
step "3. Node packages"

for dir in "$REPO" "$REPO/scripts"; do
  what="$([ "$dir" = "$REPO" ] && echo "build (Tailwind)" || echo "validator")"
  rel="${dir#"$REPO"}"; rel="${rel#/}"; rel="${rel:+$rel/}node_modules"
  if deps_ok "$dir"; then
    ok "$what packages match package-lock.json ($rel)"
  elif [ "$CHECK_ONLY" = 1 ]; then
    block "$what packages missing or out of date ($rel)" "run: make setup"
  elif deps_install "$dir"; then
    ok "$what packages installed ($rel)"
  else
    block "npm ci failed for the $what packages" "see the output above"
  fi
done
stop_if_blocked

# ─────────────────────────────────────────────────────────────────────────────
step "4. Helper checkout (maintainers' helper agents only)"

owner="$(helper_owner)"
if [ -n "$owner" ]; then
  ok "this IS a helper checkout, owned by $owner"
elif [ -e "$WORKER_PATH/.git" ]; then
  ok "$WORKER_PATH on $(git -C "$WORKER_PATH" branch --show-current 2>/dev/null || echo '?')"
else
  hint "none at $WORKER_PATH — created on demand by: make worker-reset BRANCH=<name>"
fi

# ─────────────────────────────────────────────────────────────────────────────
step "5. Task tracker (maintainers' helper agents only)"

# Never a blocker: the site, its build and its tests do not use it.
command -v houston >/dev/null 2>&1 && ok "houston on PATH" || hint "houston not on PATH — only scripts/houston.sh needs it"
command -v jq >/dev/null 2>&1 && ok "jq" || hint "jq missing — only scripts/houston.sh needs it"
tok="$REPO/.houston.local.json"
if [ -n "${CT_AUTH_TOKEN:-}" ] || [ -s "$tok" ] || { [ -n "$owner" ] && [ -s "$owner/.houston.local.json" ]; }; then
  ok "a lane token is available to scripts/houston.sh"
else
  hint "no lane token — scripts/houston.sh will say so; see CLAUDE.md"
fi

# ─────────────────────────────────────────────────────────────────────────────
stop_if_blocked
printf '\n%sReady.%s\n' "$bold$green" "$off"
printf '  make serve     run the site at http://localhost:1313/ with live reload\n'
printf '  make test      validate the listings, build, and check the built site\n'
printf '  make status    what is installed, running and checked out\n'
