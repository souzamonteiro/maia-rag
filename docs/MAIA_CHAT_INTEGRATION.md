# Maia Chat Integration

Maia Chat should consume Maia RAG through HTTP rather than importing its internal modules.

Suggested chat controls:

- RAG mode: Off / Auto / Strict
- Knowledge collections selector
- expandable Sources panel
- source preview/open action
- optional retrieval diagnostics for developers

## Strict mode

Maia Chat asks Maia RAG for evidence and instructs the generator to answer only when evidence supports the result.

## Auto mode

A lightweight routing decision determines whether retrieval is useful. Keep the router separate from the retrieval implementation.

## Source contract

Maia RAG should return stable source IDs plus human-friendly citation location (page, heading, lines or chunk). Maia Chat renders `[1]`, `[2]` references but does not fabricate them.
