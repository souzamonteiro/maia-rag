import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const file = process.env.MAIA_RAG_CONFIG || './config/default.yaml';
const cfg = YAML.parse(fs.readFileSync(file, 'utf8'));

cfg.server.host = process.env.MAIA_RAG_HOST || cfg.server.host;
cfg.server.port = Number(process.env.MAIA_RAG_PORT || cfg.server.port);
cfg.storage.dataDir = process.env.MAIA_RAG_DATA_DIR || cfg.storage.dataDir;
cfg.ollama.baseUrl = process.env.OLLAMA_BASE_URL || cfg.ollama.baseUrl;
cfg.qdrant.url = process.env.QDRANT_URL || cfg.qdrant.url;

export const config = cfg;
export const resolveData = (...parts) => path.resolve(config.storage.dataDir, ...parts);
