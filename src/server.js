import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config/index.js';
import { ensureDataLayout } from './core/fsLayout.js';
import { logger } from './core/logger.js';
import { ensureCollection } from './services/qdrantStore.js';
import { router } from './api/routes.js';

export const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(pinoHttp({ logger }));

app.use('/api', router);

const here = path.dirname(fileURLToPath(import.meta.url));
app.use('/vendor/marked', express.static(path.join(here, '../node_modules/marked/lib')));
app.use('/vendor/dompurify', express.static(path.join(here, '../node_modules/dompurify/dist')));
app.use('/vendor/highlight.js', express.static(path.join(here, '../node_modules/@highlightjs/cdn-assets')));
app.use(express.static(path.join(here, 'web/public')));

app.use((err, req, res, next) => {
  req.log?.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  ensureDataLayout();
  try {
    await ensureCollection();
  } catch (err) {
    logger.warn({ error: err.message }, 'Qdrant not ready on startup; will retry on demand');
  }
  app.listen(config.server.port, config.server.host, () => {
    logger.info(`Maia RAG listening at http://${config.server.host}:${config.server.port}`);
  });
}
