#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { ingestFile, deleteDocument, reprocessDocument } from '../ingestion/pipeline.js';
import { ensureDataLayout } from '../core/fsLayout.js';
import { ensureCollection, getCollectionStats } from '../services/qdrantStore.js';
import {
  listDocuments,
  getStats,
  listCollections,
  createCollection,
  deleteCollection,
  getCollectionByName
} from '../db/sqlite.js';
import { askRag, searchOnly } from '../rag/ragService.js';
import { listModels } from '../services/ollamaClient.js';
import { config } from '../config/index.js';

const program = new Command();
program
  .name('maia-rag')
  .description('Maia RAG command-line interface')
  .version('0.1.0');

// ----------------------------------------------------
// Add / Ingest
// ----------------------------------------------------
program
  .command('add')
  .description('Ingest a file or directory into the knowledge base')
  .argument('<path>', 'File or directory path')
  .option('-r, --recursive', 'Process directories recursively')
  .option('--no-ai-classification', 'Skip AI metadata classification')
  .option('-c, --collection <nameOrId>', 'Assign to collection')
  .action(async (target, opts) => {
    ensureDataLayout();
    try {
      await ensureCollection();
    } catch (e) {
      console.error('Warning: Qdrant vector store could not be reached:', e.message);
    }

    let collectionId = opts.collection;
    if (collectionId) {
      const coll = getCollectionByName(collectionId);
      if (coll) collectionId = coll.id;
    }

    const stat = await fs.stat(target);
    const files = [];

    async function walk(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && opts.recursive) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    }

    if (stat.isDirectory()) {
      await walk(target);
    } else {
      files.push(target);
    }

    console.log(`Found ${files.length} file(s) to process.`);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      process.stdout.write(`[${i + 1}/${files.length}] Ingesting ${path.basename(file)}... `);
      try {
        const res = await ingestFile(file, {
          aiClassification: opts.aiClassification,
          collectionId
        });
        if (res.duplicate) {
          console.log(`[DUPLICATE] (already indexed as ${res.document.id})`);
        } else {
          console.log(`[OK] (${res.chunks} chunks, doc: ${res.documentId})`);
        }
      } catch (err) {
        console.log(`[FAILED] (${err.message})`);
      }
    }
  });

// ----------------------------------------------------
// Query (RAG)
// ----------------------------------------------------
program
  .command('query')
  .description('Ask a question to the knowledge base (RAG)')
  .argument('<question>', 'Question string')
  .option('-k, --top-k <number>', 'Number of source chunks to retrieve', Number, 6)
  .option('-m, --model <modelName>', 'Ollama chat model name')
  .action(async (question, opts) => {
    try {
      console.log(`\nQuery: "${question}"`);
      console.log('Retrieving relevant context and generating answer...\n');
      const res = await askRag(question, {
        topK: opts.topK,
        model: opts.model
      });

      console.log('================== ANSWER ==================');
      console.log(res.answer);
      console.log('============================================\n');

      if (res.sources?.length) {
        console.log(`Sources (${res.sources.length}):`);
        for (const s of res.sources) {
          const loc = s.startLine ? `lines ${s.startLine}-${s.endLine}` : `chunk ${s.chunkIndex}`;
          console.log(`  [${s.index}] ${s.filename} (${loc}) - Score: ${s.score}`);
        }
      } else {
        console.log('No matching sources found.');
      }
      console.log();
    } catch (e) {
      console.error('Query failed:', e.message);
      process.exit(1);
    }
  });

// ----------------------------------------------------
// Search (Vectors only)
// ----------------------------------------------------
program
  .command('search')
  .description('Perform semantic vector search without LLM generation')
  .argument('<query>', 'Search query string')
  .option('-k, --top-k <number>', 'Number of chunks', Number, 5)
  .action(async (query, opts) => {
    try {
      const res = await searchOnly(query, { topK: opts.topK });
      console.log(`Found ${res.count} match(es):\n`);
      for (const item of res.results) {
        const loc = item.startLine ? `lines ${item.startLine}-${item.endLine}` : `chunk ${item.chunkIndex}`;
        console.log(`--- [${item.index}] ${item.filename} (${loc}) | Score: ${item.score} ---`);
        console.log(item.text.slice(0, 300) + (item.text.length > 300 ? '...' : ''));
        console.log();
      }
    } catch (e) {
      console.error('Search failed:', e.message);
      process.exit(1);
    }
  });

// ----------------------------------------------------
// Status
// ----------------------------------------------------
program
  .command('status')
  .description('Display knowledge base statistics')
  .action(async () => {
    ensureDataLayout();
    const stats = getStats();
    const qdrant = await getCollectionStats();
    console.log('\n--- Maia RAG Status ---');
    console.table({
      'Documents Total': stats.documents,
      'Documents Ready': stats.ready,
      'Documents Processing': stats.processing,
      'Documents Failed': stats.failed,
      'Chunks in SQLite': stats.chunks,
      'Vectors in Qdrant': qdrant.vectorsCount,
      'Collections': stats.collections,
      'Total Size (MB)': (stats.totalSizeBytes / (1024 * 1024)).toFixed(2)
    });
  });

// ----------------------------------------------------
// Documents
// ----------------------------------------------------
program
  .command('documents')
  .description('List ingested documents')
  .option('-l, --limit <number>', 'Max documents to display', Number, 50)
  .action((opts) => {
    ensureDataLayout();
    const docs = listDocuments({ limit: opts.limit });
    if (!docs.length) {
      console.log('No documents indexed yet.');
      return;
    }
    console.table(docs.map(d => ({
      ID: d.id.slice(0, 8),
      Filename: d.filename,
      Status: d.status,
      Chunks: d.chunk_count,
      Size: `${(d.size / 1024).toFixed(1)} KB`,
      Type: d.aiMetadata?.documentType || '-',
      Date: d.created_at.slice(0, 19).replace('T', ' ')
    })));
  });

// ----------------------------------------------------
// Delete
// ----------------------------------------------------
program
  .command('delete')
  .description('Delete a document and its indexed vectors')
  .argument('<documentId>', 'Document ID')
  .action(async (id) => {
    ensureDataLayout();
    try {
      await deleteDocument(id);
      console.log(`Document ${id} successfully deleted.`);
    } catch (e) {
      console.error('Failed to delete document:', e.message);
      process.exit(1);
    }
  });

// ----------------------------------------------------
// Reprocess
// ----------------------------------------------------
program
  .command('reprocess')
  .description('Re-extract, re-chunk, and re-embed an existing document')
  .argument('<documentId>', 'Document ID')
  .action(async (id) => {
    ensureDataLayout();
    try {
      console.log(`Reprocessing document ${id}...`);
      const res = await reprocessDocument(id);
      console.log(`Reprocessed successfully! Chunks: ${res.chunks}`);
    } catch (e) {
      console.error('Failed to reprocess document:', e.message);
      process.exit(1);
    }
  });

// ----------------------------------------------------
// Collections
// ----------------------------------------------------
const collCmd = program.command('collections').description('Manage knowledge collections');

collCmd
  .command('list')
  .description('List all collections')
  .action(() => {
    ensureDataLayout();
    const list = listCollections();
    if (!list.length) {
      console.log('No collections created yet.');
      return;
    }
    console.table(list.map(c => ({
      ID: c.id.slice(0, 8),
      Name: c.name,
      Description: c.description || '-',
      Documents: c.document_count
    })));
  });

collCmd
  .command('create')
  .description('Create a new collection')
  .argument('<name>', 'Collection name')
  .option('-d, --desc <text>', 'Description')
  .action((name, opts) => {
    ensureDataLayout();
    try {
      const coll = createCollection({
        id: crypto.randomUUID(),
        name,
        description: opts.desc || '',
        createdAt: new Date().toISOString()
      });
      console.log(`Collection '${coll.name}' created with ID: ${coll.id}`);
    } catch (e) {
      console.error('Failed to create collection:', e.message);
    }
  });

collCmd
  .command('delete')
  .description('Delete a collection')
  .argument('<id>', 'Collection ID')
  .action((id) => {
    ensureDataLayout();
    deleteCollection(id);
    console.log(`Collection ${id} deleted.`);
  });

// ----------------------------------------------------
// Doctor
// ----------------------------------------------------
program
  .command('doctor')
  .description('Inspect system health, Ollama models, Qdrant, and SQLite')
  .action(async () => {
    const checks = [];

    // 1. Ollama
    let ollamaStatus = 'FAIL';
    let models = [];
    try {
      const r = await fetch(`${config.ollama.baseUrl}/api/tags`);
      if (r.ok) {
        ollamaStatus = 'OK';
        const d = await r.json();
        models = (d.models || []).map(m => m.name);
      }
    } catch {}
    checks.push({ Component: 'Ollama Service', Status: ollamaStatus, Details: config.ollama.baseUrl });

    const hasEmbedding = models.some(m => m.startsWith(config.ollama.embeddingModel));
    checks.push({
      Component: `Embedding Model (${config.ollama.embeddingModel})`,
      Status: hasEmbedding ? 'OK' : 'MISSING',
      Details: hasEmbedding ? 'Installed' : 'Run: ollama pull ' + config.ollama.embeddingModel
    });

    const hasChat = models.some(m => m.startsWith(config.ollama.chatModel));
    checks.push({
      Component: `Chat Model (${config.ollama.chatModel})`,
      Status: hasChat ? 'OK' : 'FALLBACK',
      Details: hasChat ? 'Installed' : `Available: ${models.slice(0, 3).join(', ') || 'none'}`
    });

    // 2. Qdrant
    let qdrantStatus = 'FAIL';
    let qdrantDetails = config.qdrant.url;
    try {
      const r = await fetch(`${config.qdrant.url}/collections`);
      if (r.ok) {
        qdrantStatus = 'OK';
        const d = await r.json();
        const colls = d.result?.collections?.map(c => c.name) || [];
        qdrantDetails = `Collections: [${colls.join(', ')}]`;
      }
    } catch {}
    checks.push({ Component: 'Qdrant Vector DB', Status: qdrantStatus, Details: qdrantDetails });

    // 3. SQLite
    let sqliteStatus = 'FAIL';
    try {
      ensureDataLayout();
      const stats = getStats();
      sqliteStatus = 'OK';
      checks.push({ Component: 'SQLite Metadata', Status: sqliteStatus, Details: `${stats.documents} documents indexed` });
    } catch (e) {
      checks.push({ Component: 'SQLite Metadata', Status: 'FAIL', Details: e.message });
    }

    console.log('\n=== Maia RAG Doctor Diagnostic ===');
    console.table(checks);
    console.log();
  });

await program.parseAsync();
