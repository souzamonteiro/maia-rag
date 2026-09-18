#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Check if Qdrant is already responding on port 6333
if curl -s http://127.0.0.1:6333/collections >/dev/null 2>&1; then
  echo "Qdrant is already running on http://127.0.0.1:6333"
else
  mkdir -p ./data/qdrant
  if [ -x "./bin/qdrant" ]; then
    echo "Starting local Qdrant daemon..."
    nohup env QDRANT__STORAGE__STORAGE_PATH=./data/qdrant \
              QDRANT__SERVICE__HOST=127.0.0.1 \
              QDRANT__SERVICE__HTTP_PORT=6333 \
              ./bin/qdrant > ./data/qdrant.log 2>&1 &
    sleep 2
    if curl -s http://127.0.0.1:6333/collections >/dev/null 2>&1; then
      echo "Qdrant started successfully (PID: $!)."
    else
      echo "Failed to start Qdrant. Check ./data/qdrant.log"
      exit 1
    fi
  elif command -v docker >/dev/null 2>&1; then
    echo "Starting Qdrant with docker compose..."
    docker compose up -d
  else
    echo "Error: Qdrant binary not found in ./bin/qdrant and Docker is not installed."
    echo "Run ./scripts/bootstrap.sh to download it."
    exit 1
  fi
fi

# Check Ollama
if curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "Ollama is running on http://127.0.0.1:11434"
else
  echo "Warning: Ollama is not responding on http://127.0.0.1:11434. Start it with 'ollama serve'."
fi

