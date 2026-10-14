#!/usr/bin/env bash
# The site's test suite.
#
#   scripts/test.sh                  every check, against this working tree.
#                                    Any finding fails, old or new.
#   scripts/test.sh --base <ref>     the same checks, but only findings that
#                                    <ref> does not already have fail. Known
#                                    ones are listed, and do not fail.
#
# What runs, in order:
#   validate   scripts/validate-businesses.mjs: every listing's front matter
#              against schemas/business.schema.json, plus slugs, categories,
#              phone, postcode, email, URLs and last_verified age
#   build      a production build (hugo --gc --minify, as the deploy runs it)
#              into .cache/test/, where any hugo WARN or ERROR is a finding
#   site       scripts/check-site.py over that build: titles and descriptions,
#              internal links and anchors, images, sitemap, robots.txt,
#              llms.txt, the search index, drafts and future-dated pages
#
# Why --base exists: the CMS commits to main all day, and some listings on main
# already fail the validator. A pull request that touches one listing should be
# told about what IT broke, not blocked by forty others. CI runs with --base
# set to the commit the change is measured against; `make test` runs strict.
#
# --base checks out <ref> into .cache/test/base-src with `git archive` (no worktree,
# no branch) and runs THIS checkout's checkers and schema over it, so the two
# sides are judged by the same rules and only the site differs.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$REPO/.cache/test"

die() { printf '\033[31m✗\033[0m %s\n' "$1" >&2; shift; for l in "$@"; do printf '  \033[2m%s\033[0m\n' "$l" >&2; done; exit 2; }
say() { printf '\033[2m%s\033[0m\n' "$*" >&2; }
secs() { local ms=$(( ($(date +%s%N) - $1) / 1000000 )); printf '%d.%d' $((ms / 1000)) $((ms % 1000 / 100)); }

BASE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="${2:-}"; [ -n "$BASE" ] || die "usage: scripts/test.sh [--base <ref>]"; shift 2 ;;
    -h|--help) sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" "usage: scripts/test.sh [--base <ref>]" ;;
  esac
done

for b in hugo node python3 git; do
  command -v "$b" >/dev/null 2>&1 || die "$b not on PATH" "run: make check"
done
[ -x "$REPO/node_modules/.bin/tailwindcss" ] || die "the build's Node packages are not installed" "run: make setup"
[ -d "$REPO/scripts/node_modules/ajv" ]      || die "the validator's Node packages are not installed" "run: make setup"

# Everything a run needs from one tree, written to $2:
#   findings.txt   one line per finding, sorted — the thing that is compared
#   warnings.txt   validator warnings (never fail)
#   summary.txt    counts for the report
collect() {
  local src="$1" out="$2" t0 rc
  rm -rf "$out"; mkdir -p "$out"
  : > "$out/findings.txt"; : > "$out/summary.txt"

  # validate -----------------------------------------------------------------
  ( cd "$src" && node scripts/validate-businesses.mjs --json ) > "$out/validate.json" 2> "$out/validate.err"
  if ! node -e '
    const fs = require("fs");
    const [json, findings, warnings, summary] = process.argv.slice(1);
    const r = JSON.parse(fs.readFileSync(json, "utf8"));
    const f = [], w = [];
    for (const x of r.results) {
      for (const e of x.errors)   f.push(`validate: ${x.file}: ${e}`);
      for (const e of x.warnings) w.push(`validate: ${x.file}: ${e}`);
    }
    fs.appendFileSync(findings, f.map(l => l + "\n").join(""));
    fs.writeFileSync(warnings, w.map(l => l + "\n").join(""));
    const s = r.summary;
    fs.appendFileSync(summary, `validate  ${s.files} listings: ${s.errors} errors, ${s.warnings} warnings\n`);
  ' "$out/validate.json" "$out/findings.txt" "$out/warnings.txt" "$out/summary.txt" 2>>"$out/validate.err"; then
    echo "validate: scripts/validate-businesses.mjs: did not run ($(head -c 300 "$out/validate.err" | tr '\n' ' '))" >> "$out/findings.txt"
  fi

  # build --------------------------------------------------------------------
  # Into .cache, not /tmp: hugo here may be a snap, and a snap gets a private
  # /tmp — the build "succeeds" into a directory nothing else can see.
  t0=$(date +%s%N)
  ( cd "$src" && hugo --gc --minify --logLevel warn --printPathWarnings --printI18nWarnings \
      --destination "$out/public" ) > "$out/build.log" 2>&1
  rc=$?
  printf 'build     production build in %ss\n' "$(secs "$t0")" >> "$out/summary.txt"
  if [ "$rc" != 0 ]; then
    echo "build: hugo: exited $rc (see the build output above)" >> "$out/findings.txt"
    sed 's/^/    /' "$out/build.log" | tail -40 >&2
  fi

  # site ---------------------------------------------------------------------
  if [ -f "$out/public/index.html" ]; then
    local k base_url
    for k in drafts future expired; do
      ( cd "$src" && hugo list "$k" ) > "$out/$k.csv" 2>/dev/null || true
    done
    base_url="$(cd "$src" && hugo config 2>/dev/null | sed -n "s/^baseurl = '\(.*\)'$/\1/p")"
    [ -n "$base_url" ] || base_url="https://invalid.example/"
    python3 "$REPO/scripts/check-site.py" "$out/public" --base-url "$base_url" \
      --build-log "$out/build.log" --held-back "$out/drafts.csv" "$out/future.csv" "$out/expired.csv" \
      >> "$out/findings.txt" 2> "$out/site.err"
    printf 'site      %s\n' "$(sed 's/^check-site: //' "$out/site.err" | tail -1)" >> "$out/summary.txt"
  fi
  sort -u -o "$out/findings.txt" "$out/findings.txt"
}

START=$(date +%s%N)
say "checking this working tree…"
collect "$REPO" "$WORK/head"

if [ -n "$BASE" ]; then
  git -C "$REPO" rev-parse -q --verify "$BASE^{commit}" >/dev/null \
    || die "unknown ref: $BASE" "fetch it first, e.g. git fetch origin main"
  say "checking $BASE ($(git -C "$REPO" rev-parse --short "$BASE^{commit}")) to tell new findings from old…"
  src="$WORK/base-src"
  # Keep the base's resources/ between runs: it is Hugo's image cache, and the
  # cold build is most of the time this takes.
  rm -rf "$WORK/resources.keep"
  if [ -d "$src/resources" ]; then mv "$src/resources" "$WORK/resources.keep"; fi
  rm -rf "$src"; mkdir -p "$src"
  git -C "$REPO" archive "$BASE" | tar -x -C "$src" || die "could not export $BASE"
  if [ -d "$WORK/resources.keep" ]; then rm -rf "$src/resources"; mv "$WORK/resources.keep" "$src/resources"; fi
  # The same checkers and schema on both sides.
  mkdir -p "$src/scripts" "$src/schemas"
  cp "$REPO/scripts/validate-businesses.mjs" "$REPO/scripts/check-site.py" "$src/scripts/"
  cp "$REPO/schemas/"*.json "$src/schemas/"
  ln -sfn "$REPO/node_modules" "$src/node_modules"
  ln -sfn "$REPO/scripts/node_modules" "$src/scripts/node_modules"
  collect "$src" "$WORK/base"
  # A base we could not judge must not make this change look clean.
  if grep -q '^validate: scripts/validate-businesses.mjs: did not run' "$WORK/base/findings.txt"; then
    die "could not run the validator on $BASE" "$(grep 'did not run' "$WORK/base/findings.txt")"
  fi
fi

# report ---------------------------------------------------------------------
red=$'\033[31m'; green=$'\033[32m'; yellow=$'\033[33m'; bold=$'\033[1m'; dim=$'\033[2m'; off=$'\033[0m'
echo
sed 's/^/  /' "$WORK/head/summary.txt"

if [ -s "$WORK/head/warnings.txt" ]; then
  printf '\n%swarnings (never fail):%s\n' "$yellow" "$off"
  sed 's/^/  /' "$WORK/head/warnings.txt"
fi

if [ -n "$BASE" ]; then
  comm -13 "$WORK/base/findings.txt" "$WORK/head/findings.txt" > "$WORK/new.txt"
  comm -12 "$WORK/base/findings.txt" "$WORK/head/findings.txt" > "$WORK/known.txt"
  comm -23 "$WORK/base/findings.txt" "$WORK/head/findings.txt" > "$WORK/fixed.txt"
  if [ -s "$WORK/known.txt" ]; then
    printf '\n%salready on %s — not caused by this change, not failing it (%d):%s\n' "$dim" "$BASE" "$(wc -l < "$WORK/known.txt")" "$off"
    sed 's/^/  /' "$WORK/known.txt"
  fi
  if [ -s "$WORK/fixed.txt" ]; then
    printf '\n%sfixed by this change (%d):%s\n' "$green" "$(wc -l < "$WORK/fixed.txt")" "$off"
    sed 's/^/  /' "$WORK/fixed.txt"
  fi
  FAIL="$WORK/new.txt"; what="new finding(s), not on $BASE"
else
  FAIL="$WORK/head/findings.txt"; what="finding(s)"
fi

elapsed="$(secs "$START")"
if [ -s "$FAIL" ]; then
  printf '\n%s%s✗ %d %s:%s\n' "$bold" "$red" "$(wc -l < "$FAIL")" "$what" "$off"
  sed 's/^/  /' "$FAIL"
  printf '\n%sFAILED%s in %ss\n' "$red$bold" "$off" "$elapsed"
  exit 1
fi
printf '\n%s✓ passed%s in %ss%s\n' "$green$bold" "$off" "$elapsed" \
  "$([ -n "$BASE" ] && echo " (nothing new against $BASE)")"
