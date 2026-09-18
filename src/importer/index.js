#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { ImportQueue } from './queue.js';
import { validateSource, uploadSource } from './source.js';

function positive(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Expected a positive integer');
  return number;
}
function openQueue(file) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  return new ImportQueue(file);
}
const program = new Command().name('maia-rag-import').description('Sequential, resumable imports through the Maia RAG HTTP API');
program.command('enqueue').argument('<manifest>', 'JSONL manifest (one source per line)')
  .option('--state <file>', 'SQLite queue file', './data/imports.sqlite')
  .option('--dry-run', 'Validate only; do not create a queue or make network requests')
  .option('--limit <count>', 'Maximum records to read', positive, 100)
  .action(async (manifest, options) => {
    const queue = options.dryRun ? null : openQueue(options.state);
    let count = 0;
    let added = 0;
    let lineNumber = 0;
    const input = fs.createReadStream(manifest, { encoding: 'utf8' });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        lineNumber++;
        if (!line.trim()) continue;
        try {
          const source = validateSource(JSON.parse(line), path.dirname(path.resolve(manifest)));
          if (source.path && !fs.statSync(source.path).isFile()) throw new Error('Not a regular source file');
          if (queue) added += queue.add(source);
          count++;
        } catch (error) { throw new Error(`Manifest line ${lineNumber}: ${error.message}`); }
        if (count >= options.limit) break;
      }
      console.log(JSON.stringify({ validated: count, added, dryRun: Boolean(options.dryRun) }));
    } finally { lines.close(); input.destroy(); queue?.close(); }
  });
program.command('run')
  .option('--state <file>', 'SQLite queue file', './data/imports.sqlite')
  .option('--api <url>', 'Maia RAG service root', 'http://127.0.0.1:4310')
  .option('--limit <count>', 'Maximum documents this run', positive, 10)
  .option('--timeout-ms <ms>', 'Download and ingestion timeout per document', positive, 600000)
  .option('--max-bytes <bytes>', 'Maximum size per source', positive, 52428800)
  .option('--retry-failed', 'Requeue failed imports for one new attempt each')
  .action(async (options) => {
    const api = new URL(options.api);
    if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password || api.search || api.hash) throw new Error('Invalid API URL');
    options.api = api.href.replace(/\/$/, '');
    const queue = openQueue(options.state);
    let stopping = false;
    let heartbeat;
    let leaseError;
    const controller = new AbortController();
    const stop = () => { stopping = true; console.log('Stopping after the current document.'); };
    try {
      queue.acquire();
      if (options.retryFailed) queue.retryFailed();
      heartbeat = setInterval(() => {
        try { queue.heartbeat(); }
        catch (error) { leaseError = error; stopping = true; controller.abort(); }
      }, 10000);
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      for (let count = 0; count < options.limit && !stopping; count++) {
        const job = queue.next();
        if (!job) break;
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
        try {
          const result = await uploadSource(job.source, { ...options, signal: controller.signal });
          queue.finish(job.id, result);
          console.log(JSON.stringify({ id: job.id, status: 'done', filename: job.source.filename }));
        } catch (error) {
          queue.fail(job.id, error);
          console.error(JSON.stringify({ id: job.id, status: 'failed', error: error.message }));
          process.exitCode = 1;
          // A timeout may leave server-side ingestion running. Do not start more work.
          stopping = true;
        } finally { clearTimeout(timeout); }
      }
      if (leaseError) throw leaseError;
      console.log(JSON.stringify(queue.status()));
    } finally {
      clearInterval(heartbeat);
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      queue.close();
    }
  });
program.command('status').option('--state <file>', 'SQLite queue file', './data/imports.sqlite')
  .action(options => {
    const queue = openQueue(options.state);
    try { console.log(JSON.stringify({ counts: queue.status(), failures: queue.failures() }, null, 2)); }
    finally { queue.close(); }
  });
program.parseAsync().catch(error => { console.error(error.message); process.exitCode = 1; });
