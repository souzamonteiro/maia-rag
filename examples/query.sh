#!/usr/bin/env bash
curl -s http://127.0.0.1:4310/api/query \
  -H 'content-type: application/json' \
  -d '{"question":"What does this knowledge base say about computational modeling?"}'
