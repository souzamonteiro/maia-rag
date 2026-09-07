#!/usr/bin/env bash
curl -s http://127.0.0.1:4310/api/documents -F "file=@${1:?usage: upload.sh FILE}"
