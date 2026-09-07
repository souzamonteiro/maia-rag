# Operations

## Daily signals

Dashboard should expose:

- total/ready/processing/failed documents
- total chunks
- ingestion throughput
- queue depth
- disk usage
- duplicate count
- low-confidence metadata count
- unsupported formats
- extractor/classifier/embed latency
- Ollama/Qdrant health

## Knowledge Health

A dedicated view should identify:

- duplicate and near-duplicate documents
- low-confidence classifications
- missing bibliographic metadata
- failed extraction jobs
- stale embedding versions
- documents requiring reclassification after prompt/model upgrades
- orphan vectors or metadata

## Failure policy

Ingestion failures must be isolated per file. A bad document must never stop the watcher. Failed files move to `failed/` with a machine-readable error sidecar.

## Reprocessing

Reprocessing and re-embedding should be idempotent and version-aware. Do not blindly append new vectors; replace the affected document's previous vector set transactionally where possible.

## Logging

Use structured JSON logs. Never log full confidential document text by default. Log IDs, stage, duration, model, size and error class.
