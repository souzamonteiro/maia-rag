#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Checking Node.js..."
command -v node >/dev/null || { echo "Error: Node.js 20+ is required"; exit 1; }

echo "==> Installing dependencies..."
npm install

echo "==> Setting up Qdrant..."
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "Docker detected. Starting Qdrant via Docker Compose..."
  docker compose up -d
elif [ -x "./bin/qdrant" ]; then
  echo "Standalone Qdrant binary is already installed in ./bin/qdrant"
else
  echo "Docker not found. Downloading standalone Qdrant Linux x86_64 binary..."
  mkdir -p bin
  curl -fsSL https://github.com/qdrant/qdrant/releases/download/v1.19.1/qdrant-x86_64-unknown-linux-gnu.tar.gz | tar -xz -C bin/
  chmod +x bin/qdrant
  echo "Qdrant binary downloaded to ./bin/qdrant"
fi

echo "==> Checking Ollama models..."
if command -v ollama >/dev/null 2>&1; then
  echo "Pulling embedding model (qwen3-embedding:0.6b)..."
  ollama pull qwen3-embedding:0.6b || true
  echo "Pulling chat/classifier model (qwen2.5:3b)..."
  ollama pull qwen2.5:3b || true
else
  echo "Warning: Ollama not found in PATH. Make sure Ollama is installed and running."
fi

echo "==> Preparing data layout..."
mkdir -p data/{inbox,processing,processed,failed,originals,qdrant}

echo "==> Running doctor diagnostic..."
node src/cli/index.js doctor || true

echo "=========================================================="
echo "Bootstrap complete!"
echo "To start services (Qdrant in background): npm run start:services"
echo "To start Maia RAG server:                npm start"
echo "To start file watcher:                   npm run watch"
echo "=========================================================="
