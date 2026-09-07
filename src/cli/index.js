#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { ingestFile } from '../ingestion/pipeline.js';
import { ensureDataLayout } from '../core/fsLayout.js';
import { ensureCollection } from '../services/qdrantStore.js';
import { getDb } from '../db/sqlite.js';
import { config } from '../config/index.js';

const program = new Command();
program.name('maia-rag').description('Maia RAG command line interface').version('0.1.0');

program.command('add').argument('<path>').option('-r, --recursive').option('--no-ai-classification').action(async (target, opts) => {
  ensureDataLayout(); await ensureCollection();
  const stat = await fs.stat(target);
  const files = [];
  async function walk(p) { for (const e of await fs.readdir(p,{withFileTypes:true})) { const f=path.join(p,e.name); if(e.isDirectory()&&opts.recursive) await walk(f); else if(e.isFile()) files.push(f); } }
  if (stat.isDirectory()) await walk(target); else files.push(target);
  for (const file of files) { try { console.log(JSON.stringify(await ingestFile(file,{ aiClassification: opts.aiClassification }), null, 2)); } catch(e) { console.error(file, e.message); } }
});

program.command('status').action(() => {
  ensureDataLayout(); const db=getDb();
  const documents=db.prepare('SELECT COUNT(*) n FROM documents').get().n;
  const ready=db.prepare("SELECT COUNT(*) n FROM documents WHERE status='ready'").get().n;
  const failed=db.prepare("SELECT COUNT(*) n FROM documents WHERE status='failed'").get().n;
  const chunks=db.prepare('SELECT COALESCE(SUM(chunk_count),0) n FROM documents').get().n;
  console.table({ documents, ready, failed, chunks });
});

program.command('documents').action(() => { ensureDataLayout(); console.table(getDb().prepare('SELECT id,filename,status,chunk_count,created_at FROM documents ORDER BY created_at DESC').all()); });
program.command('doctor').action(async () => {
  const checks=[];
  try { const r=await fetch(`${config.ollama.baseUrl}/api/tags`); checks.push(['Ollama',r.ok?'OK':'FAIL']); } catch { checks.push(['Ollama','FAIL']); }
  try { const r=await fetch(`${config.qdrant.url}/collections`); checks.push(['Qdrant',r.ok?'OK':'FAIL']); } catch { checks.push(['Qdrant','FAIL']); }
  try { ensureDataLayout(); getDb().prepare('SELECT 1').get(); checks.push(['SQLite','OK']); } catch { checks.push(['SQLite','FAIL']); }
  console.table(checks.map(([component,status])=>({component,status})));
});
await program.parseAsync();
