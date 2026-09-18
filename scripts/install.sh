#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/srv/maia/maia-rag"
APP_USER="maia"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo "Error: This script must be run as root:"
  echo "  sudo ./scripts/install.sh"
  exit 1
fi

if [[ ! -f "$SOURCE_DIR/package.json" || ! -f "$SOURCE_DIR/src/server.js" ]]; then
  echo "Error: Run this script from a complete Maia RAG checkout."
  exit 1
fi

echo "==> 1. Installing system dependencies..."
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg rsync build-essential python3

echo "==> 2. Verifying Node.js (>=20)..."
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Installing Node.js LTS..."
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
    gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  printf '%s\n' "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    >/etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

NODE_VER="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
if [[ "$NODE_VER" -lt 20 ]]; then
  echo "Error: Node.js 20 or higher is required. Found: $(node -v)"
  exit 1
fi

echo "==> 3. Ensuring system user '${APP_USER}' exists..."
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/maia-rag --shell /usr/sbin/nologin "$APP_USER"
  echo "Created system user ${APP_USER}."
fi

echo "==> 4. Setting up deployment directory ${APP_DIR}..."
install -d -o root -g "$APP_USER" -m 0750 /srv/maia
install -d -o root -g "$APP_USER" -m 0750 "$APP_DIR"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$APP_DIR/data"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$APP_DIR/data"/{inbox,processing,processed,failed,originals,qdrant}
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$APP_DIR/bin"

if [[ "$SOURCE_DIR" != "$APP_DIR" ]]; then
  echo "Syncing files from $SOURCE_DIR to $APP_DIR..."
  rsync -a --delete \
    --exclude '.env' \
    --exclude '.git' \
    --exclude '.github' \
    --exclude 'node_modules' \
    --exclude 'data' \
    --exclude 'bin' \
    --exclude 'test' \
    "$SOURCE_DIR/" "$APP_DIR/"
fi

echo "==> 5. Ensuring Qdrant standalone binary is present..."
if [[ -f "$SOURCE_DIR/bin/qdrant" ]]; then
  cp "$SOURCE_DIR/bin/qdrant" "$APP_DIR/bin/qdrant"
elif [[ ! -f "$APP_DIR/bin/qdrant" ]]; then
  echo "Downloading standalone Qdrant binary..."
  curl -fsSL https://github.com/qdrant/qdrant/releases/download/v1.19.1/qdrant-x86_64-unknown-linux-gnu.tar.gz |
    tar -xz -C "$APP_DIR/bin/"
fi
chmod 0750 "$APP_DIR/bin/qdrant"
chown "$APP_USER":"$APP_USER" "$APP_DIR/bin/qdrant"

echo "==> 6. Installing production dependencies..."
cd "$APP_DIR"
npm install --omit=dev
npm rebuild better-sqlite3

echo "==> 7. Configuring environment (.env)..."
if [[ ! -f "$APP_DIR/.env" ]]; then
  cat > "$APP_DIR/.env" <<EOF
MAIA_RAG_HOST=127.0.0.1
MAIA_RAG_PORT=4310
MAIA_RAG_DATA_DIR=/srv/maia/maia-rag/data
MAIA_RAG_CONFIG=/srv/maia/maia-rag/config/default.yaml
OLLAMA_BASE_URL=http://127.0.0.1:11434
QDRANT_URL=http://127.0.0.1:6333
EOF
  echo "Created default $APP_DIR/.env."
fi

echo "==> 8. Setting permissions..."
chown -R root:"$APP_USER" "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR/data" "$APP_DIR/bin"
find "$APP_DIR" -type d -exec chmod 0750 {} +
find "$APP_DIR" -type f -exec chmod 0640 {} +
chmod 0750 "$APP_DIR/bin/qdrant"
chmod 0750 "$APP_DIR/scripts"/*.sh 2>/dev/null || true
chmod 0640 "$APP_DIR/.env"

echo "==> 9. Checking Ollama models..."
if command -v ollama >/dev/null 2>&1; then
  echo "Verifying qwen3-embedding:0.6b..."
  ollama pull qwen3-embedding:0.6b || true
  echo "Verifying qwen2.5:3b..."
  ollama pull qwen2.5:3b || true
fi

echo "==> 10. Installing systemd units..."
install -m 0644 "$APP_DIR/deploy/systemd/maia-qdrant.service" /etc/systemd/system/maia-qdrant.service
install -m 0644 "$APP_DIR/deploy/systemd/maia-rag.service" /etc/systemd/system/maia-rag.service
install -m 0644 "$APP_DIR/deploy/systemd/maia-rag-watcher.service" /etc/systemd/system/maia-rag-watcher.service

systemctl daemon-reload
systemctl enable --now maia-qdrant.service
sleep 2
systemctl enable --now maia-rag.service
systemctl enable --now maia-rag-watcher.service

echo
echo "=========================================================="
echo "Maia RAG installed successfully in /srv/maia/maia-rag!"
echo "Services status:"
systemctl --no-pager --full status maia-qdrant.service maia-rag.service maia-rag-watcher.service || true
echo "=========================================================="
echo "Service URL: http://127.0.0.1:4310"
echo "Inbox Watch: /srv/maia/maia-rag/data/inbox"
echo "Logs: journalctl -u maia-rag -f"
echo "=========================================================="

