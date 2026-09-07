import Database from 'better-sqlite3';
import { config, resolveData } from '../config/index.js';

let db;
export function getDb() {
  if (db) return db;
  db = new Database(resolveData(config.storage.sqliteFile));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, filename TEXT NOT NULL, sha256 TEXT NOT NULL UNIQUE,
      mime_type TEXT, size INTEGER, status TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}', ai_metadata_json TEXT NOT NULL DEFAULT '{}',
      embedding_model TEXT, chunk_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, document_id TEXT, stage TEXT, status TEXT,
      progress REAL NOT NULL DEFAULT 0, error TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS document_collections (
      document_id TEXT NOT NULL, collection_id TEXT NOT NULL, confidence REAL,
      source TEXT NOT NULL, PRIMARY KEY(document_id, collection_id)
    );
  `);
  return db;
}
