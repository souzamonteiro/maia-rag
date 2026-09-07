#!/usr/bin/env bash
set -euo pipefail
command -v node >/dev/null || { echo "Node.js 20+ is required"; exit 1; }
npm install
docker compose up -d
ollama pull qwen3-embedding:0.6b
ollama pull qwen2.5:3b
mkdir -p data/{inbox,processing,processed,failed,originals}
echo "Bootstrap complete. Run: npm start"
