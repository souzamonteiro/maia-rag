import path from 'node:path';
import fs from 'node:fs/promises';
import chokidar from 'chokidar';
import { config, resolveData } from '../config/index.js';
import { ensureDataLayout } from '../core/fsLayout.js';
import { ingestFile } from '../ingestion/pipeline.js';
import { ensureCollection } from '../services/qdrantStore.js';
import { logger } from '../core/logger.js';

ensureDataLayout(); await ensureCollection();
const inbox = resolveData(config.storage.inboxDir);
const processed = resolveData(config.storage.processedDir);
const failed = resolveData(config.storage.failedDir);

async function handle(file) {
  try {
    logger.info({ file }, 'ingesting');
    const result = await ingestFile(file);
    await fs.rename(file, path.join(processed, path.basename(file))).catch(() => {});
    logger.info({ file, result }, 'ingested');
  } catch (error) {
    logger.error({ file, error }, 'ingestion failed');
    await fs.rename(file, path.join(failed, path.basename(file))).catch(() => {});
    await fs.writeFile(path.join(failed, `${path.basename(file)}.error.json`), JSON.stringify({ message: error.message, at: new Date().toISOString() }, null, 2));
  }
}

chokidar.watch(inbox, { ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: config.watcher.settleMs, pollInterval: 200 } })
  .on('add', handle);
logger.info({ inbox }, 'Maia RAG watcher started');
