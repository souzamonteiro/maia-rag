#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/srv/maia/maia-rag"

if [[ $EUID -ne 0 ]]; then
  echo "Error: This script must be run as root:"
  echo "  sudo ./scripts/uninstall.sh"
  exit 1
fi

echo "==> Stopping and disabling Maia RAG systemd services..."
systemctl stop maia-rag-watcher.service maia-rag.service maia-qdrant.service 2>/dev/null || true
systemctl disable maia-rag-watcher.service maia-rag.service maia-qdrant.service 2>/dev/null || true

rm -f /etc/systemd/system/maia-rag-watcher.service \
      /etc/systemd/system/maia-rag.service \
      /etc/systemd/system/maia-qdrant.service

systemctl daemon-reload

echo "Systemd services removed."
echo "If you also want to remove application data, execute manually:"
echo "  rm -rf /srv/maia/maia-rag"

