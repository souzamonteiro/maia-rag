import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ImportQueue } from '../src/importer/queue.js';
import { validateSource, sourceBytes, uploadSource } from '../src/importer/source.js';

const source = { filename: 'article.md', text: '# Article', language: 'en' };
test('queue persists progress, deduplicates and excludes a second worker', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-import-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'queue.sqlite');
  let queue = new ImportQueue(file);
  assert.equal(queue.add(source), 1);
  assert.equal(queue.add(source), 0);
  queue.acquire();
  const second = new ImportQueue(file);
  assert.throws(() => second.acquire(), /active/);
  second.close();
  const job = queue.next();
  assert.equal(queue.next(), null);
  // Simulate interruption after claim, before recording the result.
  queue.close();
  queue = new ImportQueue(file);
  queue.acquire();
  assert.equal(queue.next().id, job.id);
  queue.fail(job.id, new Error('unavailable'));
  assert.equal(queue.retryFailed(), 1);
  assert.equal(queue.next().id, job.id);
  queue.finish(job.id, { documentId: 'doc' });
  assert.equal(queue.next(), null);
  assert.deepEqual(queue.status(), [{ status: 'done', count: 1 }]);
  queue.close();
});
test('manifest rejects ambiguous and unsafe sources and resolves local paths', () => {
  assert.throws(() => validateSource({ ...source, url: 'https://example.org' }, '/tmp'), /exactly one/);
  assert.throws(() => validateSource({ url: 'file:///etc/passwd' }, '/tmp'), /HTTP/);
  assert.throws(() => validateSource({ ...source, filename: '../escape.md' }, '/tmp'), /filename/);
  assert.throws(() => validateSource({ ...source, language: 'xx' }, '/tmp'), /Language/);
  assert.equal(validateSource({ path: 'book.pdf' }, '/tmp').path, '/tmp/book.pdf');
});
test('sources enforce download limits and preserve inline provenance', async () => {
  const data = await sourceBytes(source, { maxBytes: 1000 });
  assert.match(data.toString(), /"language":"en"/);
  await assert.rejects(sourceBytes(source, { maxBytes: 1 }), /limit/);
  await assert.rejects(sourceBytes({ url: 'https://example.org/book' }, {
    maxBytes: 2, fetchImpl: async () => new Response('too large')
  }), /limit/);
});
test('uploader disables classification and rejects failed duplicates', async () => {
  let form;
  const options = { api: 'http://rag.test', maxBytes: 1000, fetchImpl: async (_url, request) => {
    form = request.body;
    return Response.json({ documentId: 'doc' });
  } };
  assert.equal((await uploadSource(source, options)).documentId, 'doc');
  assert.equal(form.get('aiClassification'), 'false');
  assert.equal(form.get('file').name, 'article.md');
  await assert.rejects(uploadSource(source, { ...options, fetchImpl: async () => Response.json({ duplicate: true, document: { status: 'failed' } }) }), /not ready/);
  assert.equal((await uploadSource(source, { ...options, fetchImpl: async () => Response.json({ duplicate: true, document: { status: 'ready' } }) })).duplicate, true);
});

test('expired worker lease recovers a claimed job', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-lease-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'queue.sqlite');
  const first = new ImportQueue(file);
  const second = new ImportQueue(file);
  try {
    first.add(source);
    first.acquire();
    const job = first.next();
    first.db.prepare('UPDATE worker SET expires=0').run();
    second.acquire();
    assert.equal(second.next().id, job.id);
    assert.throws(() => first.heartbeat(), /lost/);
  } finally { first.close(); second.close(); }
});
