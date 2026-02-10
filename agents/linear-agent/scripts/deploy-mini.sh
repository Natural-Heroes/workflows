#!/bin/bash
# Deploy Linear Agent to Mac Mini
#
# Usage:
#   ./scripts/deploy-mini.sh              # Full deploy (first time)
#   ./scripts/deploy-mini.sh --update     # Update code only (subsequent deploys)
#
set -euo pipefail

# ─── Configuration (edit these) ──────────────────────────────────────────────
MINI_HOST="100.104.0.105"           # Mac Mini via Tailscale
MINI_USER="nevil"                   # Mac Mini username
REMOTE_DIR="/Users/nevil/Code/linear-agent"
SSH_OPTS="-o IdentitiesOnly=yes -i $HOME/.ssh/id_ed25519"

# Local paths (auto-detected)
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TUNNEL_ID="f3630128-95da-4f31-a35f-d81f589467bd"
TUNNEL_CRED="$HOME/.cloudflared/${TUNNEL_ID}.json"
PI_AUTH="$HOME/.pi/agent/auth.json"
OAUTH_TOKENS="$LOCAL_DIR/config/tokens.json"
# ─────────────────────────────────────────────────────────────────────────────

MINI="$MINI_USER@$MINI_HOST"
REMOTE_PATH="export PATH=/opt/homebrew/bin:/usr/local/bin:\$PATH"
UPDATE_ONLY=false
[[ "${1:-}" == "--update" ]] && UPDATE_ONLY=true

info()  { echo "→ $*"; }
error() { echo "✗ $*" >&2; exit 1; }

# ─── Validate local files exist ─────────────────────────────────────────────
info "Checking local files..."
[[ -f "$TUNNEL_CRED" ]]  || error "Tunnel credentials not found: $TUNNEL_CRED"
[[ -f "$PI_AUTH" ]]       || error "Pi auth not found: $PI_AUTH"
[[ -f "$OAUTH_TOKENS" ]] || error "OAuth tokens not found: $OAUTH_TOKENS"

# ─── Test SSH connectivity ───────────────────────────────────────────────────
info "Testing SSH to $MINI..."
ssh $SSH_OPTS -o ConnectTimeout=5 "$MINI" "echo ok" >/dev/null 2>&1 \
  || error "Cannot SSH to $MINI. Set up SSH key auth first:\n  ssh-copy-id $MINI"

if [[ "$UPDATE_ONLY" == true ]]; then
  info "Update mode — syncing code only..."
  rsync -avz --delete \
    --exclude node_modules \
    --exclude dist \
    --exclude .git \
    -e "ssh $SSH_OPTS" \
    "$LOCAL_DIR/" "$MINI:$REMOTE_DIR/"

  info "Installing deps & building on Mini..."
  ssh $SSH_OPTS "$MINI" "export PATH=/opt/homebrew/bin:\$PATH && cd $REMOTE_DIR && npm ci && npm run build"

  info "Restarting service..."
  ssh $SSH_OPTS "$MINI" "launchctl kickstart -k gui/\$(id -u)/com.naturalhero.linear-agent 2>/dev/null || launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/com.naturalhero.linear-agent.plist"

  info "Done! Check logs: ssh $MINI 'tail -f /tmp/linear-agent.log'"
  exit 0
fi

# ─── Full deploy ─────────────────────────────────────────────────────────────

# Step 1: Check prerequisites on Mini
info "Checking prerequisites on Mac Mini..."
ssh $SSH_OPTS "$MINI" bash <<'PREREQ_CHECK'
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
missing=""
command -v node  >/dev/null 2>&1 || missing="$missing node"
command -v npm   >/dev/null 2>&1 || missing="$missing npm"
command -v redis-server >/dev/null 2>&1 || command -v redis-cli >/dev/null 2>&1 || missing="$missing redis"
command -v cloudflared >/dev/null 2>&1 || missing="$missing cloudflared"
command -v gh    >/dev/null 2>&1 || missing="$missing gh"
command -v git   >/dev/null 2>&1 || missing="$missing git"

if [[ -n "$missing" ]]; then
  echo "MISSING:$missing"
  exit 1
fi

# Check gh is authenticated
gh auth status >/dev/null 2>&1 || { echo "MISSING: gh-auth"; exit 1; }

# Check Redis is running
redis-cli ping >/dev/null 2>&1 || { echo "MISSING: redis-running"; exit 1; }

echo "OK"
PREREQ_CHECK

PREREQ_RESULT=$(ssh $SSH_OPTS "$MINI" bash <<'CHECK'
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
missing=""
command -v node  >/dev/null 2>&1 || missing="$missing node"
command -v npm   >/dev/null 2>&1 || missing="$missing npm"
redis-cli ping   >/dev/null 2>&1 || missing="$missing redis"
command -v cloudflared >/dev/null 2>&1 || missing="$missing cloudflared"
command -v gh    >/dev/null 2>&1 || missing="$missing gh"
gh auth status   >/dev/null 2>&1 || missing="$missing gh-auth"
echo "${missing:-OK}"
CHECK
)

if [[ "$PREREQ_RESULT" != "OK" ]]; then
  echo ""
  echo "Missing on Mac Mini:$PREREQ_RESULT"
  echo ""
  echo "Install with:"
  echo "  brew install node redis cloudflared gh git"
  echo "  brew services start redis"
  echo "  gh auth login"
  echo ""
  error "Install prerequisites on Mac Mini first, then re-run this script."
fi
info "Prerequisites OK"

# Step 2: Sync project
info "Syncing project to $MINI:$REMOTE_DIR..."
ssh $SSH_OPTS "$MINI" "mkdir -p $REMOTE_DIR"
rsync -avz --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .git \
  -e "ssh $SSH_OPTS" \
  "$LOCAL_DIR/" "$MINI:$REMOTE_DIR/"

# Step 3: Copy credentials
info "Copying credentials..."
ssh $SSH_OPTS "$MINI" "mkdir -p ~/.cloudflared ~/.pi/agent"
scp $SSH_OPTS "$TUNNEL_CRED" "$MINI:~/.cloudflared/"
scp $SSH_OPTS "$PI_AUTH"      "$MINI:~/.pi/agent/auth.json"
# tokens.json is already in the project config/ dir from rsync

# Step 4: Update paths in config for Mac Mini
info "Updating config paths for Mac Mini..."
ssh $SSH_OPTS "$MINI" bash <<'REMOTE_CONFIG'
set -e
REMOTE_HOME="$HOME"

# Fix cloudflared.yml credentials path
sed -i '' "s|/Users/nevilhulspas|$REMOTE_HOME|g" /Users/nevil/Code/linear-agent/config/cloudflared.yml

# Fix repo paths in agent.config.json
sed -i '' "s|/Users/nevilhulspas/Code|$REMOTE_HOME/Code|g" /Users/nevil/Code/linear-agent/config/agent.config.json
REMOTE_CONFIG

# Step 5: Clone repos from agent.config.json
info "Ensuring repos exist on Mac Mini..."
# Parse repo paths from config, extract directory names
REPO_NAMES=$(python3 -c "
import json, os
with open('$LOCAL_DIR/config/agent.config.json') as f:
    config = json.load(f)
for repo in config.get('repos', []):
    name = os.path.basename(repo['path'])
    branch = repo.get('defaultBranch', 'dev')
    print(f'{name}:{branch}')
")

for entry in $REPO_NAMES; do
  REPO_NAME="${entry%%:*}"
  REPO_BRANCH="${entry##*:}"
  info "  Repo: $REPO_NAME (branch: $REPO_BRANCH)"
  ssh $SSH_OPTS "$MINI" bash -s "$REPO_NAME" "$REPO_BRANCH" <<'CLONE_REPO'
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO_NAME="$1"
REPO_BRANCH="$2"
REPOS_DIR="$HOME/Code"
mkdir -p "$REPOS_DIR"

if [[ ! -d "$REPOS_DIR/$REPO_NAME" ]]; then
  echo "Cloning $REPO_NAME..."
  gh repo clone "Natural-Heroes/$REPO_NAME" "$REPOS_DIR/$REPO_NAME"
  cd "$REPOS_DIR/$REPO_NAME"
  git checkout "$REPO_BRANCH"
else
  echo "$REPO_NAME already exists, pulling latest..."
  cd "$REPOS_DIR/$REPO_NAME"
  git checkout "$REPO_BRANCH" && git pull origin "$REPO_BRANCH"
fi
CLONE_REPO
done

# Step 6: Install deps & build
info "Installing dependencies & building..."
ssh $SSH_OPTS "$MINI" "export PATH=/opt/homebrew/bin:\$PATH && cd $REMOTE_DIR && npm ci && npm run build"

# Step 7: Set up Pi auth (needs interactive login on Mini)
info "Checking Pi auth on Mac Mini..."
PI_AUTH_EXISTS=$(ssh $SSH_OPTS "$MINI" "[[ -f ~/.pi/agent/auth.json ]] && echo yes || echo no")
if [[ "$PI_AUTH_EXISTS" == "no" ]]; then
  echo ""
  echo "⚠  Pi auth token may need to be refreshed on the Mini."
  echo "   SSH into the Mini and run: npx pi then /login"
  echo ""
fi

# Step 8: Create LaunchAgent plist
info "Creating LaunchAgent for auto-start..."
ssh $SSH_OPTS "$MINI" bash <<'LAUNCH_AGENT'
set -e
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST="$PLIST_DIR/com.naturalhero.linear-agent.plist"
AGENT_DIR="$HOME/Code/linear-agent"
LOG_DIR="$HOME/Library/Logs/linear-agent"

mkdir -p "$PLIST_DIR" "$LOG_DIR"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.naturalhero.linear-agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${AGENT_DIR}/scripts/start.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${AGENT_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>${HOME}</string>
    </dict>
</dict>
</plist>
PLIST_EOF

echo "Plist created at $PLIST"
LAUNCH_AGENT

# Step 9: Load the LaunchAgent
info "Starting the service..."
ssh $SSH_OPTS "$MINI" bash <<'START_SERVICE'
PLIST="$HOME/Library/LaunchAgents/com.naturalhero.linear-agent.plist"
UID_VAL=$(id -u)

# Unload if already loaded
launchctl bootout "gui/$UID_VAL/com.naturalhero.linear-agent" 2>/dev/null || true
sleep 2

# Load
launchctl bootstrap "gui/$UID_VAL" "$PLIST"
sleep 3

# Verify
LOG_DIR="$HOME/Library/Logs/linear-agent"
if [[ -f "$LOG_DIR/stdout.log" ]]; then
  tail -5 "$LOG_DIR/stdout.log"
fi
START_SERVICE

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Linear Agent deployed to Mac Mini!"
echo ""
echo "  Logs:     ssh $MINI 'tail -f ~/Library/Logs/linear-agent/stdout.log'"
echo "  Status:   ssh $MINI 'launchctl print gui/\$(id -u)/com.naturalhero.linear-agent'"
echo "  Restart:  ssh $MINI 'launchctl kickstart -k gui/\$(id -u)/com.naturalhero.linear-agent'"
echo "  Stop:     ssh $MINI 'launchctl bootout gui/\$(id -u)/com.naturalhero.linear-agent'"
echo ""
echo "  Update code later: ./scripts/deploy-mini.sh --update"
echo "════════════════════════════════════════════════════════════"
