#!/usr/bin/env bash
# Read and record a maintainer task in Houston, the maintainers' task tracker.
# Only maintainers' helper agents use this; the site does not need it.
#
#   scripts/houston.sh task MD-123              the brief: description,
#                                               acceptance criteria, gates, decisions
#   scripts/houston.sh queue [dave|susan]       what is ready for an agent in a lane
#   scripts/houston.sh comment MD-123 "text"    leave a progress note
#   scripts/houston.sh checkpoint MD-123 "did X" "next Y" ["blocked by Z"]
#   scripts/houston.sh status MD-123 ready_for_review
#   scripts/houston.sh decision MD-123 "what" "why"
#
# It needs the `houston` binary and jq, and a lane token: CT_AUTH_TOKEN, or
# {"token": "…"} in .houston.local.json at the root of this checkout (gitignored;
# never commit it). Run from the helper checkout, it reads the owning checkout's
# file. It never falls back to any other credential on the machine: a token
# confined to one lane is the point, and a missing one is an error.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

command -v houston >/dev/null 2>&1 || die "houston not on PATH" "only maintainers' helper agents use this script"
command -v jq      >/dev/null 2>&1 || die "jq not on PATH"

TOKEN_FILE="$REPO/.houston.local.json"
owner="$(helper_owner)"
if [ ! -s "$TOKEN_FILE" ] && [ -n "$owner" ] && [ -s "$owner/.houston.local.json" ]; then
  TOKEN_FILE="$owner/.houston.local.json"
fi
TOKEN="${CT_AUTH_TOKEN:-$(jq -r '.token // empty' "$TOKEN_FILE" 2>/dev/null)}"
DBURL="${CT_DATABASE_URL:-$(jq -r '.database_url // empty' "$HOME/.config/houston/config.json" 2>/dev/null)}"
[ -n "$TOKEN" ] || die "no Houston lane token for this project" \
  "expected {\"token\": \"…\"} in $REPO/.houston.local.json (gitignored), or CT_AUTH_TOKEN" \
  "a maintainer with planning access mints one per lane; do not substitute another credential"
[ -n "$DBURL" ] || die "no Houston database url" \
  "expected CT_DATABASE_URL, or database_url in ~/.config/houston/config.json"

# One request per invocation: `houston mcp` serves MCP on stdio, so the
# handshake is replayed each time. A few hundred milliseconds buys statelessness.
call() {
  local tool="$1" args="$2" out line
  out="$(printf '%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"houston.sh","version":"1"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    "$(jq -nc --arg t "$tool" --argjson a "$args" '{jsonrpc:"2.0",id:2,method:"tools/call",params:{name:$t,arguments:$a}}')" \
    | CT_AUTH_TOKEN="$TOKEN" CT_DATABASE_URL="$DBURL" timeout 60 houston mcp 2>/dev/null)" \
    || die "could not reach Houston" "is its database reachable?"

  line="$(printf '%s' "$out" | grep '"id":2' | tail -1)"
  [ -n "$line" ] || die "Houston returned nothing for $tool" "is the token valid for this project?"

  if [ "$(jq -r '.result.isError // false' <<<"$line")" = "true" ]; then
    die "Houston refused $tool" "$(jq -r '.result.content[0].text // "no detail"' <<<"$line")"
  fi
  jq -r '.result.content[0].text // ""' <<<"$line"
}

need() { [ -n "${1:-}" ] || die "$2"; }

case "${1:-}" in
  task)
    need "${2:-}" "usage: scripts/houston.sh task <ref>"
    # Rendered, not raw JSON: an agent reading its own brief should not have to
    # parse an escaped blob to find the acceptance criteria.
    call get_task_context "$(jq -nc --arg r "$2" '{ref_id:$r,warnings:true}')" | jq -r '
      .task as $t |
      "=== \($t.project_code // "")-\($t.ref_number // "?") — \($t.title) ===",
      "status: \($t.status)   lane: \($t.lane // "-")   epic: \(.epic_ref_id // "-") \(.epic_title // "")",
      "",
      ($t.description // "(no description)"),
      "",
      (if ($t.acceptance_criteria // "") != "" then
        "=== ACCEPTANCE CRITERIA ===", $t.acceptance_criteria
      else
        "=== ACCEPTANCE CRITERIA ===",
        "Not returned to a worker. They should also be written into the description above."
      end),
      (if ((.gates // []) | length) > 0 then "", "=== OPEN GATES (resolve before starting) ===",
        (.gates[] | "- \(.prompt)") else empty end),
      (if ((.decisions // []) | length) > 0 then "", "=== DECISIONS ===",
        (.decisions[] | "- \(.summary): \(.rationale)") else empty end),
      (if ((.checkpoints // []) | length) > 0 then "", "=== LATEST CHECKPOINT ===",
        (.checkpoints[-1] | "progress: \(.progress)\nnext: \(.next_steps // "-")") else empty end)
    '
    ;;

  queue)
    lane="${2:-dave}"
    out="$(call list_agent_queue "$(jq -nc --arg l "$lane" '{lane:$l}')")"
    jq -r '(.queue // [])[] | "\(.ref_id)  \(.title)"' <<<"$out" 2>/dev/null || printf '%s\n' "$out"
    [ "$(jq -r '.count // 0' <<<"$out" 2>/dev/null)" != 0 ] || echo "(nothing is ready for an agent in $lane)"
    ;;

  comment)
    need "${2:-}" "usage: scripts/houston.sh comment <ref> <text>"
    need "${3:-}" "usage: scripts/houston.sh comment <ref> <text>"
    call add_comment "$(jq -nc --arg r "$2" --arg b "$3" '{task_ref:$r,body:$b}')"
    ;;

  checkpoint)
    need "${2:-}" "usage: scripts/houston.sh checkpoint <ref> <progress> [next] [blockers]"
    need "${3:-}" "usage: scripts/houston.sh checkpoint <ref> <progress> [next] [blockers]"
    call create_checkpoint "$(jq -nc --arg r "$2" --arg p "$3" --arg n "${4:-}" --arg b "${5:-}" \
      '{task_ref:$r,progress:$p} + (if $n=="" then {} else {next_steps:$n} end) + (if $b=="" then {} else {blockers:$b} end)')"
    ;;

  status)
    need "${2:-}" "usage: scripts/houston.sh status <ref> <status>"
    need "${3:-}" "usage: scripts/houston.sh status <ref> <status>"
    call set_task_status "$(jq -nc --arg r "$2" --arg s "$3" '{ref_id:$r,status:$s}')"
    ;;

  decision)
    need "${2:-}" "usage: scripts/houston.sh decision <ref> <summary> <rationale>"
    need "${3:-}" "usage: scripts/houston.sh decision <ref> <summary> <rationale>"
    need "${4:-}" "usage: scripts/houston.sh decision <ref> <summary> <rationale>"
    call create_decision "$(jq -nc --arg r "$2" --arg s "$3" --arg w "$4" \
      '{scope:"task",scope_ref:$r,summary:$s,rationale:$w}')"
    ;;

  *)
    sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 1 ;;
esac
