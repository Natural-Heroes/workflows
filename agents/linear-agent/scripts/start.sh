#!/bin/bash
# Start the Linear Agent server and Cloudflare tunnel
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Start the server in the background (use compiled dist/ in production)
echo "Starting Hero agent server..."
if [[ -f dist/main.js ]]; then
  node dist/main.js &
else
  npx tsx src/main.ts &
fi
SERVER_PID=$!

# Wait for server to be ready
sleep 3

# Start named cloudflare tunnel
echo "Starting Cloudflare tunnel (hero.naturalhero.es)..."
cloudflared tunnel --config config/cloudflared.yml run 2>&1 | tee /tmp/cloudflared.log &
TUNNEL_PID=$!

echo ""
echo "Server PID: $SERVER_PID"
echo "Tunnel PID: $TUNNEL_PID"
echo ""
echo "Tunnel URL: https://hero.naturalhero.es"
echo "Webhook:    https://hero.naturalhero.es/webhooks/linear"

# Wait for either process to exit
wait $SERVER_PID $TUNNEL_PID
