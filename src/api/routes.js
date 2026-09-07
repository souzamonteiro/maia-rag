import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { config, resolveData } from '../config/index.js';
import { ingestFile } from '../ingestion/pipeline.js';
import { askRag } from '../rag/ragService.js';
import { getDb } from '../db/sqlite.js';

const uploadDir = resolveData(config.storage.inboxDir);
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });
export const router = express.Router();

router.get('/health', (req,res) => res.json({ ok: true, service: 'maia-rag' }));
router.get('/documents', (req,res) => {
  const docs = getDb().prepare('SELECT * FROM documents ORDER BY created_at DESC LIMIT 500').all();
  res.json(docs.map(d => ({ ...d, metadata: JSON.parse(d.metadata_json), aiMetadata: JSON.parse(d.ai_metadata_json) })));
});
router.get('/stats', (req,res) => {
  const db = getDb();
  const documents = db.prepare('SELECT COUNT(*) n FROM documents').get().n;
  const ready = db.prepare("SELECT COUNT(*) n FROM documents WHERE status='ready'").get().n;
  const failed = db.prepare("SELECT COUNT(*) n FROM documents WHERE status='failed'").get().n;
  const chunks = db.prepare('SELECT COALESCE(SUM(chunk_count),0) n FROM documents').get().n;
  res.json({ documents, ready, failed, chunks });
});
router.post('/documents', upload.single('file'), async (req,res,next) => {
  try {
    const result = await ingestFile(req.file.path, { originalName: req.file.originalname });
    await fsp.unlink(req.file.path).catch(() => {});
    res.status(201).json(result);
  } catch (e) {
    await fsp.unlink(req.file?.path).catch(() => {});
    next(e);
  }
});
router.post('/query', async (req,res,next) => {
  try { res.json(await askRag(req.body.question, req.body.options || {})); }
  catch (e) { next(e); }
});
