import fs from 'node:fs';
import { config, resolveData } from '../config/index.js';

export function ensureDataLayout() {
  const dirs = ['originalsDir','inboxDir','processingDir','processedDir','failedDir'];
  fs.mkdirSync(resolveData(), { recursive: true });
  for (const key of dirs) fs.mkdirSync(resolveData(config.storage[key]), { recursive: true });
}
