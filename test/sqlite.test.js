import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  getDb,
  insertDocument,
  getDocumentById,
  getDocumentByHash,
  listDocuments,
  countDocuments,
  updateDocumentReady,
  updateDocumentStatus,
  deleteDocumentRecord,
  createCollection,
  listCollections,
  deleteCollection,
  assignDocumentToCollection,
  createJob,
  updateJob,
  getJobsForDocument,
  getStats
} from '../src/db/sqlite.js';

test('sqlite document operations lifecycle', () => {
  const db = getDb();
  assert.ok(db);

  const id = randomUUID();
  const sha256 = 'testhash_' + randomUUID();
  const now = new Date().toISOString();

  // 1. Insert document
  insertDocument({
    id,
    filename: 'sample.txt',
    sha256,
    mimeType: 'text/plain',
    size: 1024,
    status: 'processing',
    createdAt: now
  });

  // 2. Fetch by ID
  const doc = getDocumentById(id);
  assert.ok(doc);
  assert.equal(doc.id, id);
  assert.equal(doc.filename, 'sample.txt');
  assert.equal(doc.status, 'processing');

  // 3. Fetch by Hash
  const byHash = getDocumentByHash(sha256);
  assert.ok(byHash);
  assert.equal(byHash.id, id);

  // 4. Update to ready
  updateDocumentReady({
    id,
    metadata: { pages: 1 },
    aiMetadata: { documentType: 'notes' },
    embeddingModel: 'test-model',
    chunkCount: 3,
    updatedAt: new Date().toISOString()
  });

  const readyDoc = getDocumentById(id);
  assert.equal(readyDoc.status, 'ready');
  assert.equal(readyDoc.chunk_count, 3);
  assert.equal(readyDoc.aiMetadata?.documentType, 'notes');

  // 5. List and count
  const list = listDocuments({ search: 'sample.txt' });
  assert.ok(list.some(d => d.id === id));
  const count = countDocuments({ search: 'sample.txt' });
  assert.ok(count >= 1);

  // 6. Delete
  deleteDocumentRecord(id);
  assert.equal(getDocumentById(id), null);
});

test('sqlite collections and job tracking', () => {
  const collId = randomUUID();
  const collName = 'test-collection-' + Date.now();
  const now = new Date().toISOString();

  // Create collection
  const coll = createCollection({
    id: collId,
    name: collName,
    description: 'Test description',
    createdAt: now
  });
  assert.ok(coll);
  assert.equal(coll.name, collName);

  const collections = listCollections();
  assert.ok(collections.some(c => c.id === collId));

  // Create document and assign to collection
  const docId = randomUUID();
  insertDocument({
    id: docId,
    filename: 'tagged.txt',
    sha256: 'hash_' + docId,
    mimeType: 'text/plain',
    size: 500,
    status: 'ready',
    createdAt: now
  });

  assignDocumentToCollection({
    documentId: docId,
    collectionId: collId,
    confidence: 0.95,
    source: 'test'
  });

  const docWithColls = getDocumentById(docId);
  assert.ok(docWithColls.collections.some(c => c.id === collId));

  // Job tracking
  const jobId = randomUUID();
  createJob({
    id: jobId,
    documentId: docId,
    stage: 'extracting',
    status: 'running',
    progress: 0.2,
    createdAt: now
  });

  updateJob({
    id: jobId,
    stage: 'indexing',
    status: 'completed',
    progress: 1.0,
    updatedAt: new Date().toISOString()
  });

  const jobs = getJobsForDocument(docId);
  assert.ok(jobs.some(j => j.id === jobId && j.status === 'completed'));

  // Clean up
  deleteCollection(collId);
  deleteDocumentRecord(docId);
  assert.equal(getDocumentById(docId), null);
});

