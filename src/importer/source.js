import path from 'node:path';
import fs from 'node:fs/promises';

const extensions = new Set(['.pdf', '.md', '.markdown', '.txt', '.text']);
export function validateSource(input, baseDir) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a JSON object');
  const keys = ['path', 'url', 'text'].filter(key => typeof input[key] === 'string' && input[key].trim());
  if (keys.length !== 1) throw new Error('Specify exactly one of path, url or text');
  const kind = keys[0];
  const source = { [kind]: kind === 'path' ? path.resolve(baseDir, input.path) : input[kind] };
  if (kind === 'url') {
    const url = new URL(source.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Source URL must use HTTP(S) without credentials');
  }
  const filename = input.filename || (kind === 'path' ? path.basename(source.path) : 'article.md');
  if (typeof filename !== 'string' || filename !== path.basename(filename) || /[\\\r\n]/.test(filename) || !extensions.has(path.extname(filename).toLowerCase())) throw new Error('Use a plain filename ending in .pdf, .md or .txt');
  if (kind === 'text' && path.extname(filename).toLowerCase() === '.pdf') throw new Error('Inline text cannot be a PDF');
  source.filename = filename;
  for (const key of ['title', 'author', 'language', 'license', 'sourceUrl', 'version', 'collectionId']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string' || input[key].length > 4000) throw new Error(`Invalid ${key}`);
      source[key] = input[key];
    }
  }
  if (source.language && !['pt', 'en', 'es'].includes(source.language)) throw new Error('Language must be pt, en or es');
  return source;
}

export async function sourceBytes(source, { maxBytes, signal, fetchImpl = fetch }) {
  let bytes;
  if (source.text !== undefined) {
    const metadata = Object.fromEntries(Object.entries(source).filter(([key]) => !['text', 'filename', 'collectionId'].includes(key)));
    bytes = Buffer.from(`Source metadata: ${JSON.stringify(metadata)}\n\n${source.text}`);
  } else if (source.path) {
    const handle = await fs.open(source.path, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > maxBytes) throw new Error('Source is not a regular file or exceeds the size limit');
      bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      bytes = bytes.subarray(0, offset);
    } finally { await handle.close(); }
  } else {
    const response = await fetchImpl(source.url, { signal, redirect: 'error' });
    if (!response.ok) throw new Error(`Download HTTP ${response.status}`);
    const parts = [];
    let total = 0;
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > maxBytes) throw new Error('Download exceeds the size limit');
      parts.push(chunk);
    }
    bytes = Buffer.concat(parts);
  }
  if (!bytes.length || bytes.length > maxBytes) throw new Error('Empty source or size limit exceeded');
  return bytes;
}

export async function uploadSource(source, options) {
  const bytes = await sourceBytes(source, options);
  const form = new FormData();
  form.append('file', new Blob([bytes]), source.filename);
  form.append('aiClassification', 'false');
  if (source.collectionId) form.append('collectionId', source.collectionId);
  const response = await (options.fetchImpl || fetch)(`${options.api}/api/documents`, { method: 'POST', body: form, signal: options.signal });
  if (!response.ok) throw new Error(`Ingestion HTTP ${response.status}`);
  const result = await response.json();
  if (result.duplicate && result.document?.status !== 'ready') throw new Error('Matching document is not ready. Resolve its failed/processing record in Maia RAG before retrying.');
  if (!result.duplicate && !result.documentId) throw new Error('Invalid ingestion response');
  return result;
}
