import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import mime from 'mime-types';
import { randomUUID } from 'node:crypto';
import { config, resolveData } from '../config/index.js';
import { getDb } from '../db/sqlite.js';
import { extractDocument } from './extractors/index.js';
import { chunkText } from './chunkers/textChunker.js';
import { chunkCode } from './chunkers/codeChunker.js';
import { classifyDocument } from './classifiers/aiClassifier.js';
import { embed } from '../services/ollamaClient.js';
import { upsertChunks } from '../services/qdrantStore.js';

const codeExt = new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.py','.c','.h','.cpp','.hpp','.java','.go','.rs','.php','.rb','.sh','.maia']);
const now = () => new Date().toISOString();

async function sha256(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function ingestFile(filePath, options = {}) {
  const db = getDb();
  const stat = await fs.stat(filePath);
  const hash = await sha256(filePath);
  const existing = db.prepare('SELECT * FROM documents WHERE sha256=?').get(hash);
  if (existing) return { duplicate: true, document: existing };

  const id = randomUUID();
  const filename = path.basename(options.originalName || filePath);
  const created = now();
  db.prepare(`INSERT INTO documents(id,filename,sha256,mime_type,size,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`)
    .run(id, filename, hash, mime.lookup(filename) || 'application/octet-stream', stat.size, 'processing', created, created);

  try {
    const extracted = await extractDocument(filePath);
    let ai = {};
    if (config.classification.enabled && options.aiClassification !== false) {
      ai = await classifyDocument({ filename, text: extracted.text, technicalMetadata: extracted.metadata });
    }

    const ext = path.extname(filename).toLowerCase();
    let chunks;
    if (codeExt.has(ext)) chunks = chunkCode(extracted.text).map((c, i) => ({ ...c, index: i }));
    else chunks = chunkText(extracted.text).map((text, i) => ({ text, index: i }));

    const vectors = await embed(chunks.map(c => c.text));
    const points = chunks.map((c, i) => ({
      id: randomUUID(), vector: vectors[i], payload: {
        documentId: id, filename, chunkIndex: c.index, text: c.text,
        startLine: c.startLine, endLine: c.endLine,
        documentType: ai.documentType || null, language: ai.language || null,
        domains: ai.domains || [], keywords: ai.keywords || [], project: ai.probableProject || null
      }
    }));
    if (points.length) await upsertChunks(points);

    const destDir = resolveData(config.storage.originalsDir, id);
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(filePath, path.join(destDir, filename));

    db.prepare(`UPDATE documents SET status='ready', metadata_json=?, ai_metadata_json=?, embedding_model=?, chunk_count=?, updated_at=? WHERE id=?`)
      .run(JSON.stringify(extracted.metadata), JSON.stringify(ai), config.ollama.embeddingModel, chunks.length, now(), id);
    return { duplicate: false, documentId: id, chunks: chunks.length, aiMetadata: ai };
  } catch (err) {
    db.prepare(`UPDATE documents SET status='failed', updated_at=? WHERE id=?`).run(now(), id);
    throw err;
  }
}
