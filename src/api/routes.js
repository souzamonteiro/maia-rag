import express from 'express';
import { createDocumentUpload, originalUploadName } from './uploads.js';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { config, resolveData } from '../config/index.js';
import {
  getDocumentById,
  listDocuments,
  countDocuments,
  listCollections,
  getCollectionById,
  createCollection,
  deleteCollection,
  assignDocumentToCollection,
  removeDocumentFromCollection,
  getStats,
  getHealthStats
} from '../db/sqlite.js';
import { ingestFile, deleteDocument, reprocessDocument } from '../ingestion/pipeline.js';
import { askRag, searchOnly } from '../rag/ragService.js';
import { isHealthy as isOllamaHealthy, listModels } from '../services/ollamaClient.js';
import { getCollectionStats, getChunksByDocumentId } from '../services/qdrantStore.js';
import { logger } from '../core/logger.js';

const upload = createDocumentUpload(resolveData(), resolveData(config.storage.inboxDir));

export const router = express.Router();

// ----------------------------------------------------
// Health & Diagnostics
// ----------------------------------------------------
router.get('/health', async (req, res) => {
  const ollamaOk = await isOllamaHealthy();
  const qdrantStats = await getCollectionStats();
  const qdrantOk = qdrantStats.status !== 'error';

  const ok = ollamaOk && qdrantOk;
  res.status(ok ? 200 : 503).json({
    ok,
    service: 'maia-rag',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    components: {
      ollama: { status: ollamaOk ? 'OK' : 'FAIL', baseUrl: config.ollama.baseUrl },
      qdrant: { status: qdrantOk ? 'OK' : 'FAIL', url: config.qdrant.url, ...qdrantStats },
      sqlite: { status: 'OK' }
    }
  });
});

router.get('/stats', async (req, res) => {
  const stats = getStats();
  const qdrantStats = await getCollectionStats();
  res.json({
    ...stats,
    qdrant: qdrantStats
  });
});

router.get('/health/summary', (req, res) => {
  res.json(getHealthStats());
});

router.get('/models', async (req, res) => {
  const models = await listModels();
  res.json({
    models,
    configured: {
      embedding: config.ollama.embeddingModel,
      classifier: config.ollama.classifierModel,
      chat: config.ollama.chatModel
    }
  });
});

// ----------------------------------------------------
// Documents
// ----------------------------------------------------
router.get('/documents', (req, res) => {
  const requestedLimit = Number(req.query.limit ?? 100);
  const offset = Number(req.query.offset ?? 0);
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || !Number.isSafeInteger(offset) || offset < 0) {
    return res.status(400).json({ error: 'limit must be a positive integer and offset a non-negative integer' });
  }
  const limit = Math.min(requestedLimit, 500);
  const status = req.query.status ? String(req.query.status) : undefined;
  const collectionId = req.query.collectionId ? String(req.query.collectionId) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;

  const total = countDocuments({ status, collectionId, search });
  const documents = listDocuments({ limit, offset, status, collectionId, search });

  res.json({ total, limit, offset, documents });
});

router.get('/documents/:id', async (req, res) => {
  const doc = getDocumentById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const chunks = await getChunksByDocumentId(req.params.id);
  res.json({
    ...doc,
    chunks: chunks.map(pt => ({
      id: pt.id,
      ...pt.payload
    }))
  });
});

router.post('/documents', upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Use form field "file".' });
  }

  const filePath = req.file.path;
  const originalName = originalUploadName(req.file.originalname);
  const collectionId = req.body.collectionId;
  const aiClassification = req.body.aiClassification !== 'false';

  try {
    const result = await ingestFile(filePath, {
      originalName,
      collectionId,
      aiClassification
    });
    await fsp.unlink(filePath).catch(() => {});
    res.status(201).json(result);
  } catch (err) {
    await fsp.unlink(filePath).catch(() => {});
    next(err);
  }
});

router.delete('/documents/:id', async (req, res, next) => {
  try {
    const result = await deleteDocument(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/documents/:id/reprocess', async (req, res, next) => {
  try {
    const result = await reprocessDocument(req.params.id, {
      aiClassification: req.body.aiClassification !== false
    });
    res.json(result);
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/documents/:id/original', async (req, res) => {
  const doc = getDocumentById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const originalPath = resolveData(config.storage.originalsDir, doc.id, doc.filename);
  try {
    await fsp.access(originalPath);
    res.download(originalPath, doc.filename);
  } catch {
    res.status(404).json({ error: 'Original file is not available on disk' });
  }
});

// ----------------------------------------------------
// Collections
// ----------------------------------------------------
router.get('/collections', (req, res) => {
  res.json(listCollections());
});

router.post('/collections', (req, res) => {
  const { name, description } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Collection name is required' });
  }

  const id = randomUUID();
  const created = new Date().toISOString();
  try {
    const coll = createCollection({ id, name: name.trim(), description: description || '', createdAt: created });
    res.status(201).json(coll);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: `Collection '${name}' already exists` });
    }
    throw err;
  }
});

router.get('/collections/:id', (req, res) => {
  const coll = getCollectionById(req.params.id);
  if (!coll) return res.status(404).json({ error: 'Collection not found' });

  const documents = listDocuments({ collectionId: req.params.id, limit: 200 });
  res.json({ ...coll, documents });
});

router.delete('/collections/:id', (req, res) => {
  deleteCollection(req.params.id);
  res.json({ success: true, id: req.params.id });
});

router.post('/documents/:id/collections', (req, res) => {
  const { collectionId } = req.body;
  if (!collectionId) return res.status(400).json({ error: 'collectionId is required' });

  assignDocumentToCollection({
    documentId: req.params.id,
    collectionId,
    confidence: 1.0,
    source: 'manual'
  });
  res.json({ success: true, documentId: req.params.id, collectionId });
});

router.delete('/documents/:id/collections/:collectionId', (req, res) => {
  removeDocumentFromCollection(req.params.id, req.params.collectionId);
  res.json({ success: true, documentId: req.params.id, collectionId: req.params.collectionId });
});

// ----------------------------------------------------
// Retrieval & Query
// ----------------------------------------------------
router.post('/search', async (req, res, next) => {
  try {
    const query = req.body.query || req.body.question;
    if (!query) return res.status(400).json({ error: 'Field "query" is required' });
    const results = await searchOnly(query, req.body.options || {});
    res.json(results);
  } catch (e) {
    next(e);
  }
});

router.post('/query', async (req, res, next) => {
  try {
    const question = req.body.question;
    if (!question) return res.status(400).json({ error: 'Field "question" is required' });
    const response = await askRag(question, req.body.options || {});
    res.json(response);
  } catch (e) {
    next(e);
  }
});
