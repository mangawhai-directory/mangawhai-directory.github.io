# Shared by scripts/setup.sh, scripts/worker.sh and scripts/houston.sh.
# Sourced, not run.

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The helper checkout: a separate clone beside this one, never inside it, that
# helper agents work in so nothing they do lands in the tree you have open.
WORKER_PATH="${MD_WORKER_PATH:-$(cd "$REPO/.." && pwd)/.worker/mangawhai-directory}"

# Written into the helper's .git directory (invisible to git status) by
# `worker.sh reset`. It names the checkout that owns the helper, which lets the
# helper's own copy of these scripts refuse to manage helpers, and lets
# houston.sh find the owner's token file.
HELPER_MARK=helper-of
helper_owner() { cat "$(git -C "${1:-$REPO}" rev-parse --absolute-git-dir 2>/dev/null)/$HELPER_MARK" 2>/dev/null; }

die() { printf '\033[31m✗\033[0m %s\n' "$1" >&2; shift; for l in "$@"; do printf '  \033[2m%s\033[0m\n' "$l" >&2; done; exit 1; }
say() { printf '\033[2m%s\033[0m\n' "$*" >&2; }

# Node packages are "installed" when node_modules was installed from the
# package-lock.json that is there now. npm ci writes nothing we can compare
# against, so we leave a stamp: the lockfile's hash, next to the packages.
lock_hash() { sha256sum "$1/package-lock.json" 2>/dev/null | cut -d' ' -f1; }
deps_ok()   { [ -n "$(lock_hash "$1")" ] && [ "$(cat "$1/node_modules/.installed-from" 2>/dev/null)" = "$(lock_hash "$1")" ]; }
deps_install() {
  ( cd "$1" && npm ci --no-audit --no-fund --loglevel=error ) || return 1
  lock_hash "$1" > "$1/node_modules/.installed-from"
}
