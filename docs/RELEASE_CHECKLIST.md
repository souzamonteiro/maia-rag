# First Public Release Checklist

- [x] Select and add project license (Apache-2.0).
- [x] Set GitHub repository to `souzamonteiro/maia-rag` in README and package manifests.
- [x] Confirm embedding model (`qwen3-embedding:0.6b`, 1024 dimensions) and vector settings in `config/default.yaml`.
- [x] Run `npm install` and commit generated `package-lock.json`.
- [x] Run unit/integration tests with Ollama and Qdrant available (`npm test`).
- [x] Validate PDF, DOCX, Markdown, Text, and source code extractors.
- [x] Add delete and reprocess semantics for document lifecycle.
- [x] Provide standalone Qdrant binary support for Linux host environments without Docker.
- [x] Provide automated production deployment script (`scripts/install.sh`) for `/srv/maia/maia-rag` and systemd units.
- [x] Ensure all technical documentation is written in English.
