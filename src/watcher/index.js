import path from 'node:path';
import fs from 'node:fs/promises';
import chokidar from 'chokidar';
import { config, resolveData } from '../config/index.js';
import { ensureDataLayout } from '../core/fsLayout.js';
import { ingestFile } from '../ingestion/pipeline.js';
import { ensureCollection } from '../services/qdrantStore.js';
import { logger } from '../core/logger.js';

ensureDataLayout();
try {
  await ensureCollection();
} catch (e) {
  logger.warn({ error: e.message }, 'Watcher started but Qdrant is not immediately reachable');
}

const inbox = resolveData(config.storage.inboxDir);
const processed = resolveData(config.storage.processedDir);
const failed = resolveData(config.storage.failedDir);

async function handle(file) {
  const filename = path.basename(file);
  // Ignore dotfiles and temporary write files
  if (filename.startsWith('.') || filename.endsWith('.tmp') || filename.endsWith('.crdownload')) {
    return;
  }

  logger.info({ file }, 'Detected new file in inbox; starting ingestion');
  try {
    const result = await ingestFile(file);
    const dest = path.join(processed, `${Date.now()}_${filename}`);
    await fs.rename(file, dest).catch(async () => {
      await fs.copyFile(file, dest).catch(() => {});
      await fs.unlink(file).catch(() => {});
    });

    if (result.duplicate) {
      logger.info({ file, existingId: result.document.id }, 'File already indexed (duplicate)');
    } else {
      logger.info({ file, documentId: result.documentId, chunks: result.chunks }, 'File successfully ingested');
    }
  } catch (error) {
    logger.error({ file, error: error.message }, 'File ingestion failed');
    const dest = path.join(failed, `${Date.now()}_${filename}`);
    await fs.rename(file, dest).catch(async () => {
      await fs.copyFile(file, dest).catch(() => {});
      await fs.unlink(file).catch(() => {});
    });
    const errorJson = {
      filename,
      error: error.message,
      stack: error.stack,
      failedAt: new Date().toISOString()
    };
    await fs.writeFile(`${dest}.error.json`, JSON.stringify(errorJson, null, 2)).catch(() => {});
  }
}

const watcher = chokidar.watch(inbox, {
  ignoreInitial: false,
  depth: 1,
  awaitWriteFinish: {
    stabilityThreshold: config.watcher.settleMs || 1500,
    pollInterval: 200
  }
});

watcher.on('add', handle);
logger.info({ inbox }, 'Maia RAG inbox watcher active');

process.on('SIGINT', async () => {
  logger.info('Shutting down watcher...');
  await watcher.close();
  process.exit(0);
});
