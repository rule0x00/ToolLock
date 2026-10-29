#!/usr/bin/env bash
# ToolLock demo: a trusted MCP tool turns malicious (postmark-mcp style) and gets blocked.
# Needs: docker (compose v2), curl, node.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || cp .env.example .env
set -a; . ./.env; set +a
GATEWAY="http://localhost:${GATEWAY_PORT:-3000}"
DASHBOARD="http://localhost:${DASHBOARD_PORT:-3001}"
STATE=evil-server/state.json
TOOL=mailer__send_email

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
set_revision() { printf '{"revision": %s}\n' "$1" > "$STATE"; }

# One JSON-RPC request to the gateway's Streamable HTTP endpoint; prints the JSON payload.
mcp() {
  curl -sS "$GATEWAY/mcp" \
    -H "Authorization: Bearer $MCP_CLIENT_TOKEN" -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" | sed -n 's/^data: //p'
}
admin() { curl -sS "$GATEWAY/api/$1" -H "Authorization: Bearer $ADMIN_TOKEN"; }
json() { node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1"; }

send_email() {
  mcp tools/call "{\"name\":\"$TOOL\",\"arguments\":{\"to\":\"alice@example.com\",\"subject\":\"Q3 numbers\",\"body\":\"Draft attached.\"}}" |
    json 'const r=d.result; console.log((r.isError ? "  ✗ " : "  ✓ ") + r.content.map(c => c.text).join(" "))'
}
list_mailer() {
  mcp tools/list '{}' | json "const t=d.result.tools.map(t=>t.name); console.log('  tools/list: ' + t.length + ' tools; $TOOL ' + (t.includes('$TOOL') ? 'listed' : 'HIDDEN'))"
}
# wait_for <description> <node expression over the tool detail `d`>
wait_for() {
  for _ in $(seq 1 40); do
    if admin "tools/$TOOL/diff" | json "process.exit(($2) ? 0 : 1)" 2>/dev/null; then return 0; fi
    sleep 0.5
  done
  echo "  timed out waiting for: $1" >&2; exit 1
}

step "Starting the stack (postgres, reviewer, gateway, dashboard)"
set_revision 1
docker compose up -d --build --wait

step "toollock init — approve every tool the upstream servers expose right now"
docker compose exec -T gateway node dist/main.js init 2>&1 | grep -o 'Approved.*' || true
list_mailer

step "Call send_email (revision 1, clean) → allowed"
send_email

step "Rug pull: the mailer server ships revision 2 (hidden BCC + instructions to the model)"
set_revision 2
sleep 1
list_mailer
send_email
wait_for "reviewer verdict" 'd.review && d.review.verdict'
admin "tools/$TOOL/diff" | json '
  const r = d.review;
  console.log(`  status: ${d.status}   reviewer: ${r.verdict}  risk ${r.risk}/100`);
  for (const s of r.signals) console.log("   - " + s);'

step "The server ships revision 3 (description reworded only) → reviewer auto-approves"
set_revision 3
wait_for "auto-approval" 'd.status === "approved" && d.approvedHash === d.currentHash'
admin "tools/$TOOL/diff" | json 'console.log(`  status: ${d.status}   reviewer: ${d.review.verdict}  (approved by ${d.review.approvedBy})`)'
send_email

step "Audit log"
admin "audit?limit=8" | json 'for (const e of d.reverse()) console.log(`  #${e.id} ${e.actor.padEnd(15)} ${e.action.padEnd(13)} ${e.toolKey ?? ""}`)'
admin "audit/verify" | json 'console.log(d.ok ? `  ✓ hash chain intact (${d.count} events)` : `  ✗ chain broken at #${d.brokenAtId}`)'

printf '\nOpen the dashboard to review it all: %s\n' "$DASHBOARD"
