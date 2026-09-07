# First Public Release Checklist

- [ ] Select and add project license.
- [ ] Replace `YOUR-USER` in README clone example.
- [ ] Confirm embedding model and vector dimension in `config/default.yaml` on the target Ollama installation.
- [ ] Run `npm install` and commit the generated `package-lock.json`.
- [ ] Run unit/integration tests with Ollama and Qdrant available.
- [ ] Add upload limits and authentication before exposing the Web UI outside localhost/WireGuard.
- [ ] Validate PDF handling against representative academic files.
- [ ] Add delete/reprocess semantics before indexing valuable long-lived corpora.
- [ ] Add backup procedure for originals + metadata.
