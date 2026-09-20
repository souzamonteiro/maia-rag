import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import chokidar from 'chokidar';
import { createDocumentUpload, originalUploadName } from '../src/api/uploads.js';

test('HTTP upload survives an active inbox watcher until ingestion copies it', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-upload-race-'));
  const inbox = path.join(dir, 'inbox');
  await fs.mkdir(inbox);
  const seen = [];
  const watcher = chokidar.watch(inbox, { ignoreInitial: true });
  watcher.on('add', file => { seen.push(file); });
  await new Promise(resolve => watcher.on('ready', resolve));
  const app = express();
  const upload = createDocumentUpload(dir, inbox);
  app.post('/upload', upload.single('file'), async (req, res, next) => {
    try {
      await new Promise(resolve => setTimeout(resolve, 200));
      const target = path.join(dir, 'original.md');
      await fs.copyFile(req.file.path, target);
      await fs.unlink(req.file.path);
      res.json({ text: await fs.readFile(target, 'utf8'), filename: originalUploadName(req.file.originalname) });
    } catch (error) { next(error); }
  });
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await watcher.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const form = new FormData();
  form.append('file', new Blob(['# Document']), 'Currículo.md');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/upload`, { method: 'POST', body: form });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: '# Document', filename: 'Currículo.md' });
  assert.deepEqual(seen, []);
  assert.deepEqual(await fs.readdir(path.join(dir, 'http-uploads')), []);
  assert.throws(() => createDocumentUpload(dir, dir), /outside/);
});

test('upload names preserve Unicode and repair multipart mojibake', () => {
  for (const name of ['README.md', 'Currículo.pdf', '日本語.pdf']) {
    assert.equal(originalUploadName(name), name);
  }
  assert.equal(originalUploadName(Buffer.from('Currículo.pdf').toString('latin1')), 'Currículo.pdf');
});
