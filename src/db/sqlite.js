import Database from 'better-sqlite3';
import { config, resolveData } from '../config/index.js';

let dbInstance;

export function getDb() {
  if (dbInstance) return dbInstance;
  dbInstance = new Database(resolveData(config.storage.sqliteFile));
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      sha256 TEXT NOT NULL UNIQUE,
      mime_type TEXT,
      size INTEGER,
      status TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      ai_metadata_json TEXT NOT NULL DEFAULT '{}',
      embedding_model TEXT,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      document_id TEXT,
      stage TEXT,
      status TEXT,
      progress REAL NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_collections (
      document_id TEXT NOT NULL,
      collection_id TEXT NOT NULL,
      confidence REAL,
      source TEXT NOT NULL,
      PRIMARY KEY(document_id, collection_id),
      FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY(collection_id) REFERENCES collections(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_docs_status ON documents(status);
    CREATE INDEX IF NOT EXISTS idx_docs_sha256 ON documents(sha256);
    CREATE INDEX IF NOT EXISTS idx_jobs_doc_id ON jobs(document_id);
  `);
  return dbInstance;
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// Document helpers
export function parseDocRow(d) {
  if (!d) return null;
  let metadata = {};
  let aiMetadata = {};
  try { metadata = JSON.parse(d.metadata_json || '{}'); } catch {}
  try { aiMetadata = JSON.parse(d.ai_metadata_json || '{}'); } catch {}
  return {
    ...d,
    metadata,
    aiMetadata,
    metadata_json: undefined,
    ai_metadata_json: undefined
  };
}

export function getDocumentById(id) {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc) return null;
  const parsed = parseDocRow(doc);
  parsed.collections = db.prepare(`
    SELECT c.id, c.name, dc.confidence, dc.source
    FROM collections c
    JOIN document_collections dc ON c.id = dc.collection_id
    WHERE dc.document_id = ?
  `).all(id);
  return parsed;
}

export function getDocumentByHash(hash) {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE sha256 = ?').get(hash);
  return parseDocRow(doc);
}

export function listDocuments({ limit = 100, offset = 0, status, collectionId, search } = {}) {
  const db = getDb();
  let sql = `
    SELECT d.* FROM documents d
  `;
  const params = [];
  const whereClauses = [];

  if (collectionId) {
    sql += ` JOIN document_collections dc ON d.id = dc.document_id AND dc.collection_id = ? `;
    params.push(collectionId);
  }

  if (status) {
    whereClauses.push(`d.status = ?`);
    params.push(status);
  }

  if (search) {
    whereClauses.push(`(d.filename LIKE ? OR d.ai_metadata_json LIKE ?)`);
    params.push(`%${search}%`, `%${search}%`);
  }

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')} `;
  }

  sql += ` ORDER BY d.created_at DESC, d.id DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params);
  return rows.map(parseDocRow);
}

export function countDocuments({ status, collectionId, search } = {}) {
  const db = getDb();
  let sql = `SELECT COUNT(DISTINCT d.id) as n FROM documents d`;
  const params = [];
  const whereClauses = [];

  if (collectionId) {
    sql += ` JOIN document_collections dc ON d.id = dc.document_id AND dc.collection_id = ? `;
    params.push(collectionId);
  }

  if (status) {
    whereClauses.push(`d.status = ?`);
    params.push(status);
  }

  if (search) {
    whereClauses.push(`(d.filename LIKE ? OR d.ai_metadata_json LIKE ?)`);
    params.push(`%${search}%`, `%${search}%`);
  }

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')} `;
  }

  return db.prepare(sql).get(...params).n;
}

export function insertDocument({ id, filename, sha256, mimeType, size, status, createdAt }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO documents(id, filename, sha256, mime_type, size, status, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, filename, sha256, mimeType, size, status, createdAt, createdAt);
}

export function updateDocumentReady({ id, metadata, aiMetadata, embeddingModel, chunkCount, updatedAt }) {
  const db = getDb();
  db.prepare(`
    UPDATE documents
    SET status = 'ready',
        metadata_json = ?,
        ai_metadata_json = ?,
        embedding_model = ?,
        chunk_count = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    JSON.stringify(metadata || {}),
    JSON.stringify(aiMetadata || {}),
    embeddingModel,
    chunkCount,
    updatedAt,
    id
  );
}

export function updateDocumentStatus(id, status, updatedAt) {
  const db = getDb();
  db.prepare('UPDATE documents SET status = ?, updated_at = ? WHERE id = ?').run(status, updatedAt, id);
}

export function deleteDocumentRecord(id) {
  const db = getDb();
  const deleteTransaction = db.transaction(() => {
    db.prepare('DELETE FROM document_collections WHERE document_id = ?').run(id);
    db.prepare('DELETE FROM jobs WHERE document_id = ?').run(id);
    db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  });
  deleteTransaction();
}

// Job helpers
export function createJob({ id, documentId, stage, status = 'running', progress = 0, error = null, createdAt }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO jobs(id, document_id, stage, status, progress, error, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, documentId, stage, status, progress, error, createdAt, createdAt);
}

export function updateJob({ id, stage, status, progress, error = null, updatedAt }) {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET stage = COALESCE(?, stage),
        status = COALESCE(?, status),
        progress = COALESCE(?, progress),
        error = ?,
        updated_at = ?
    WHERE id = ?
  `).run(stage, status, progress, error, updatedAt, id);
}

export function getJobsForDocument(documentId) {
  const db = getDb();
  return db.prepare('SELECT * FROM jobs WHERE document_id = ? ORDER BY created_at DESC').all(documentId);
}

// Collection helpers
export function listCollections() {
  const db = getDb();
  return db.prepare(`
    SELECT c.*, COUNT(dc.document_id) as document_count
    FROM collections c
    LEFT JOIN document_collections dc ON c.id = dc.collection_id
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all();
}

export function getCollectionById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM collections WHERE id = ?').get(id);
}

export function getCollectionByName(name) {
  const db = getDb();
  return db.prepare('SELECT * FROM collections WHERE name = ?').get(name);
}

export function createCollection({ id, name, description = '', createdAt }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO collections(id, name, description, created_at)
    VALUES(?, ?, ?, ?)
  `).run(id, name, description, createdAt);
  return getCollectionById(id);
}

export function deleteCollection(id) {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM document_collections WHERE collection_id = ?').run(id);
    db.prepare('DELETE FROM collections WHERE id = ?').run(id);
  });
  tx();
}

export function assignDocumentToCollection({ documentId, collectionId, confidence = 1.0, source = 'manual' }) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO document_collections(document_id, collection_id, confidence, source)
    VALUES(?, ?, ?, ?)
  `).run(documentId, collectionId, confidence, source);
}

export function removeDocumentFromCollection(documentId, collectionId) {
  const db = getDb();
  db.prepare('DELETE FROM document_collections WHERE document_id = ? AND collection_id = ?')
    .run(documentId, collectionId);
}

// Stats & Health
export function getStats() {
  const db = getDb();
  const documents = db.prepare('SELECT COUNT(*) n FROM documents').get().n;
  const ready = db.prepare("SELECT COUNT(*) n FROM documents WHERE status='ready'").get().n;
  const failed = db.prepare("SELECT COUNT(*) n FROM documents WHERE status='failed'").get().n;
  const processing = db.prepare("SELECT COUNT(*) n FROM documents WHERE status='processing'").get().n;
  const chunks = db.prepare('SELECT COALESCE(SUM(chunk_count), 0) n FROM documents').get().n;
  const collections = db.prepare('SELECT COUNT(*) n FROM collections').get().n;
  const totalSizeBytes = db.prepare('SELECT COALESCE(SUM(size), 0) n FROM documents').get().n;
  return { documents, ready, failed, processing, chunks, collections, totalSizeBytes };
}

export function getHealthStats() {
  const db = getDb();
  const stats = getStats();
  const recentErrors = db.prepare(`
    SELECT d.id, d.filename, j.stage, j.error, j.updated_at
    FROM jobs j
    JOIN documents d ON d.id = j.document_id
    WHERE j.status = 'failed'
    ORDER BY j.updated_at DESC
    LIMIT 20
  `).all();

  const lowConfidence = db.prepare(`
    SELECT id, filename, ai_metadata_json
    FROM documents
    WHERE status = 'ready' AND ai_metadata_json LIKE '%"confidence":0.%'
    LIMIT 50
  `).all().map(parseDocRow).filter(d => (d.aiMetadata?.confidence ?? 1) < 0.7);

  return {
    ...stats,
    recentErrors,
    lowConfidenceCount: lowConfidence.length,
    lowConfidenceSample: lowConfidence.slice(0, 10)
  };
}
