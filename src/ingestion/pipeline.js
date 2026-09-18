import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import mime from 'mime-types';
import { randomUUID } from 'node:crypto';
import { config, resolveData } from '../config/index.js';
import {
  getDocumentById,
  getDocumentByHash,
  insertDocument,
  updateDocumentReady,
  updateDocumentStatus,
  deleteDocumentRecord,
  createJob,
  updateJob,
  assignDocumentToCollection,
  getCollectionByName,
  createCollection
} from '../db/sqlite.js';
import { extractDocument } from './extractors/index.js';
import { chunkText } from './chunkers/textChunker.js';
import { chunkCode } from './chunkers/codeChunker.js';
import { classifyDocument } from './classifiers/aiClassifier.js';
import { embed } from '../services/ollamaClient.js';
import { upsertChunks, deleteByDocumentId } from '../services/qdrantStore.js';
import { logger } from '../core/logger.js';

const codeExt = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.py', '.c', '.h', '.cpp', '.hpp', '.java', '.go', '.rs', '.php', '.rb',
  '.sh', '.bash', '.maia', '.ebnf', '.sql'
]);

const now = () => new Date().toISOString();

async function sha256(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function ingestFile(filePath, options = {}) {
  const stat = await fs.stat(filePath);
  const hash = await sha256(filePath);
  const existing = getDocumentByHash(hash);
  if (existing) {
    logger.info({ hash, filename: existing.filename }, 'File already indexed (duplicate)');
    return { duplicate: true, document: existing };
  }

  const id = options.id || randomUUID();
  const jobId = randomUUID();
  const filename = path.basename(options.originalName || filePath);
  const created = now();

  insertDocument({
    id,
    filename,
    sha256: hash,
    mimeType: mime.lookup(filename) || 'application/octet-stream',
    size: stat.size,
    status: 'processing',
    createdAt: created
  });

  createJob({
    id: jobId,
    documentId: id,
    stage: 'extracting',
    status: 'running',
    progress: 0.1,
    createdAt: created
  });

  try {
    // 1. Extraction
    const extracted = await extractDocument(filePath, filename);
    updateJob({ id: jobId, stage: 'classifying', progress: 0.3, updatedAt: now() });

    // 2. Non-blocking AI Classification (ADR-005)
    let ai = {};
    if (config.classification.enabled && options.aiClassification !== false) {
      try {
        ai = await classifyDocument({
          filename,
          text: extracted.text,
          technicalMetadata: extracted.metadata
        });
      } catch (classifyErr) {
        logger.warn({ filename, error: classifyErr.message }, 'Non-blocking AI classification failed; continuing');
        ai = {
          documentType: 'document',
          domains: [],
          keywords: [],
          confidence: 0,
          error: classifyErr.message
        };
      }
    }

    updateJob({ id: jobId, stage: 'chunking', progress: 0.5, updatedAt: now() });

    // 3. Document-aware chunking
    const ext = path.extname(filename).toLowerCase();
    let chunks;
    if (codeExt.has(ext)) {
      chunks = chunkCode(extracted.text).map((c, i) => ({ ...c, index: i }));
    } else {
      chunks = chunkText(extracted.text).map((text, i) => ({ text, index: i }));
    }

    updateJob({ id: jobId, stage: 'embedding', progress: 0.7, updatedAt: now() });

    // 4. Batch Embeddings
    const texts = chunks.map(c => c.text);
    const vectors = texts.length > 0 ? await embed(texts, { batchSize: config.ollama.batchSize || 16 }) : [];

    updateJob({ id: jobId, stage: 'indexing', progress: 0.9, updatedAt: now() });

    // 5. Qdrant Vector Upsert
    const points = chunks.map((c, i) => ({
      id: randomUUID(),
      vector: vectors[i],
      payload: {
        documentId: id,
        filename,
        chunkIndex: c.index,
        text: c.text,
        startLine: c.startLine || null,
        endLine: c.endLine || null,
        documentType: ai.documentType || null,
        language: ai.language || null,
        domains: ai.domains || [],
        keywords: ai.keywords || [],
        project: ai.probableProject || null,
        collectionId: options.collectionId || null
      }
    }));

    if (points.length > 0) {
      await upsertChunks(points);
    }

    // 6. Retain Original File
    const destDir = resolveData(config.storage.originalsDir, id);
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(filePath, path.join(destDir, filename));

    // 7. Auto / Manual Collection Assignment
    if (options.collectionId) {
      assignDocumentToCollection({
        documentId: id,
        collectionId: options.collectionId,
        confidence: 1.0,
        source: 'manual'
      });
    } else if (config.classification.autoAssignCollections && ai.probableProject) {
      let coll = getCollectionByName(ai.probableProject);
      if (!coll) {
        coll = createCollection({
          id: randomUUID(),
          name: ai.probableProject,
          description: `Auto-generated collection for ${ai.probableProject}`,
          createdAt: now()
        });
      }
      assignDocumentToCollection({
        documentId: id,
        collectionId: coll.id,
        confidence: ai.confidence || 0.8,
        source: 'ai'
      });
    }

    // 8. Update SQLite
    const finishTime = now();
    updateDocumentReady({
      id,
      metadata: extracted.metadata,
      aiMetadata: ai,
      embeddingModel: config.ollama.embeddingModel,
      chunkCount: chunks.length,
      updatedAt: finishTime
    });

    updateJob({
      id: jobId,
      stage: 'completed',
      status: 'completed',
      progress: 1.0,
      updatedAt: finishTime
    });

    logger.info({ documentId: id, filename, chunks: chunks.length }, 'Document ingested successfully');
    return {
      duplicate: false,
      documentId: id,
      filename,
      chunks: chunks.length,
      aiMetadata: ai
    };
  } catch (err) {
    const failTime = now();
    logger.error({ id, filename, error: err.message }, 'Document ingestion failed');
    updateDocumentStatus(id, 'failed', failTime);
    updateJob({
      id: jobId,
      stage: 'failed',
      status: 'failed',
      error: err.message,
      updatedAt: failTime
    });
    throw err;
  }
}

export async function deleteDocument(documentId) {
  const doc = getDocumentById(documentId);
  if (!doc) throw new Error(`Document ${documentId} not found`);

  // Delete Qdrant vectors
  try {
    await deleteByDocumentId(documentId);
  } catch (e) {
    logger.warn({ documentId, error: e.message }, 'Error removing vectors from Qdrant');
  }

  // Delete original file directory
  const destDir = resolveData(config.storage.originalsDir, documentId);
  await fs.rm(destDir, { recursive: true, force: true }).catch(() => {});

  // Delete database record
  deleteDocumentRecord(documentId);
  logger.info({ documentId }, 'Document deleted');
  return { success: true, documentId };
}

export async function reprocessDocument(documentId, options = {}) {
  const doc = getDocumentById(documentId);
  if (!doc) throw new Error(`Document ${documentId} not found`);

  const originalDir = resolveData(config.storage.originalsDir, documentId);
  const originalPath = path.join(originalDir, doc.filename);

  try {
    await fs.access(originalPath);
  } catch {
    throw new Error(`Original file not found for document ${documentId}`);
  }

  // Delete existing vectors
  await deleteByDocumentId(documentId).catch(() => {});

  // Reset status to processing
  updateDocumentStatus(documentId, 'processing', now());

  return ingestFile(originalPath, {
    id: documentId,
    originalName: doc.filename,
    aiClassification: options.aiClassification,
    collectionId: options.collectionId || (doc.collections?.[0]?.id)
  });
}
