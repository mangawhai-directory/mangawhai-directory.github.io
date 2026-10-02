#!/usr/bin/env bash
# The helper checkout: a second copy of this repository for helper agents.
#
#   scripts/worker.sh reset <branch>     create it, or reset it, onto a fresh
#                                        <branch> from origin/main
#   scripts/worker.sh run <cmd> [args]   run a command in it (e.g. make test)
#   scripts/worker.sh status             where it is, what branch, what changed
#
# It is a separate CLONE at ../.worker/mangawhai-directory (beside this checkout,
# never inside it; MD_WORKER_PATH overrides). A clone, not a git worktree, so it
# adds nothing to this checkout's .git and shares none of its branches: a helper
# can do anything there and the tree you have open stays exactly as it is.
#
# One copy is reused for every task. `reset` throws away whatever the last task
# left — uncommitted changes, untracked files, its branch — and keeps
# node_modules, which are reinstalled only when a package-lock.json changed.
#
# A push to main deploys the live site, so the helper checkout refuses one: a
# pre-push hook rejects any push to main, from any branch, to any remote.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Run from inside the helper checkout, these scripts would treat it as the
# owner and look for a helper inside .worker/.worker. Refuse, and say where to go.
owner="$(helper_owner)"
[ -z "$owner" ] || die "this is the helper checkout — run scripts/worker.sh from $owner" \
  "e.g.  cd $owner && scripts/worker.sh run make test"

# Never the same tree, never one inside the other.
real_repo="$(realpath -m "$REPO")"; real_worker="$(realpath -m "$WORKER_PATH")"
case "$real_repo/" in "$real_worker/"*) die "this checkout is at or inside the helper path ($WORKER_PATH)" ;; esac
case "$real_worker/" in "$real_repo/"*) die "the helper path ($WORKER_PATH) is inside this checkout" "it must sit beside it" ;; esac

is_helper() { [ -e "$WORKER_PATH/.git" ] && [ "$(helper_owner "$WORKER_PATH")" = "$REPO" ]; }

PRE_PUSH='#!/bin/sh
# Installed by scripts/worker.sh. In this repository a push to main deploys the
# live site, and a helper never does that: it pushes its own branch and opens a
# pull request.
while read -r local_ref local_sha remote_ref remote_sha; do
  case "$remote_ref" in
    refs/heads/main|refs/heads/master|refs/heads/gh-pages)
      echo "helper checkout: refusing to push to ${remote_ref#refs/heads/} — push a branch and open a pull request" >&2
      exit 1 ;;
  esac
done
exit 0'

case "${1:-}" in
  reset)
    branch="${2:-}"
    [ -n "$branch" ] || die "usage: scripts/worker.sh reset <branch>" "e.g. scripts/worker.sh reset md-123-fix-sitemap"
    case "$branch" in main|master|gh-pages|HEAD|origin/*)
      die "refusing to put the helper on '$branch'" "give it a branch of its own, e.g. md-123-short-slug" ;;
    esac
    git check-ref-format --branch "$branch" >/dev/null 2>&1 || die "'$branch' is not a valid branch name"

    if [ ! -e "$WORKER_PATH/.git" ]; then
      [ -z "$(ls -A "$WORKER_PATH" 2>/dev/null)" ] \
        || die "$WORKER_PATH exists, is not empty, and is not a checkout" "move it aside and re-run"
      url="$(git -C "$REPO" remote get-url origin 2>/dev/null)" || die "this checkout has no origin remote"
      say "cloning $url into $WORKER_PATH…"
      mkdir -p "$(dirname "$WORKER_PATH")"
      git clone -q --no-checkout "$url" "$WORKER_PATH" || die "could not clone $url"
      printf '%s\n' "$REPO" > "$(git -C "$WORKER_PATH" rev-parse --absolute-git-dir)/$HELPER_MARK"
    fi
    is_helper || die "$WORKER_PATH is a checkout, but not this checkout's helper" \
      "it is marked as $(helper_owner "$WORKER_PATH" || echo 'nobody'\''s') — leave it alone or set MD_WORKER_PATH"

    hooks="$(git -C "$WORKER_PATH" rev-parse --absolute-git-dir)/hooks"
    mkdir -p "$hooks" && printf '%s\n' "$PRE_PUSH" > "$hooks/pre-push" && chmod +x "$hooks/pre-push" \
      || die "could not install the pre-push guard"

    # Ignored files (node_modules, public/, resources/, .cache/) survive on purpose.
    git -C "$WORKER_PATH" fetch --prune -q origin || die "could not fetch in $WORKER_PATH"
    git -C "$WORKER_PATH" reset -q --hard 2>/dev/null || true
    git -C "$WORKER_PATH" clean -fdq \
      && git -C "$WORKER_PATH" checkout -q --no-track -B "$branch" origin/main \
      || die "could not reset the helper checkout"
    # Drop every other local branch, so a stale one cannot be pushed by mistake.
    git -C "$WORKER_PATH" for-each-ref --format='%(refname:short)' refs/heads/ \
      | grep -vxF "$branch" | xargs -r git -C "$WORKER_PATH" branch -q -D

    for dir in "$WORKER_PATH" "$WORKER_PATH/scripts"; do
      deps_ok "$dir" || { say "installing Node packages in ${dir#"$WORKER_PATH"/}…"; deps_install "$dir" || die "npm ci failed in $dir"; }
    done
    echo "helper checkout on $(git -C "$WORKER_PATH" branch --show-current) at $(git -C "$WORKER_PATH" log --oneline -1)"
    echo "  $WORKER_PATH"
    ;;

  run)
    shift
    [ $# -gt 0 ] || die "usage: scripts/worker.sh run <command> [args]"
    is_helper || die "no helper checkout at $WORKER_PATH" "create it with: scripts/worker.sh reset <branch>"
    cd "$WORKER_PATH" && exec "$@"
    ;;

  status)
    if ! is_helper; then echo "no helper checkout at $WORKER_PATH"; exit 1; fi
    echo "$WORKER_PATH"
    echo "  branch   $(git -C "$WORKER_PATH" branch --show-current) at $(git -C "$WORKER_PATH" log --oneline -1)"
    echo "  ahead    $(git -C "$WORKER_PATH" rev-list --count origin/main..HEAD) commit(s) of origin/main"
    changes="$(git -C "$WORKER_PATH" status --porcelain | wc -l)"
    echo "  changes  $changes uncommitted"
    ;;

  *)
    sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 1 ;;
esac
