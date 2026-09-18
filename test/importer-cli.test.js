import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

test('CLI dry-run, enqueue, bounded processing and resume use the HTTP API', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-cli-'));
  const state = path.join(dir, 'queue.sqlite');
  const manifest = path.join(dir, 'sources.jsonl');
  await fs.writeFile(manifest, [1, 2].map(n => JSON.stringify({ text: `Article ${n}`, filename: `article-${n}.md` })).join('\n'));
  const cli = (...args) => exec(process.execPath, ['src/importer/index.js', ...args, '--state', state], { cwd: process.cwd() });
  let requests = 0;
  const server = http.createServer(async (req, res) => {
    assert.equal(req.url, '/api/documents');
    assert.equal(req.method, 'POST');
    for await (const _chunk of req) { /* consume multipart body */ }
    requests++;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ documentId: `doc-${requests}`, duplicate: false }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); });
  const api = `http://127.0.0.1:${server.address().port}`;
  await cli('enqueue', manifest, '--dry-run');
  await assert.rejects(fs.access(state));
  await cli('enqueue', manifest);
  await cli('enqueue', manifest);
  await cli('run', '--api', api, '--limit', '1');
  assert.equal(requests, 1);
  let status = JSON.parse((await cli('status')).stdout);
  assert.ok(status.counts.some(row => row.status === 'pending' && row.count === 1));
  await cli('run', '--api', api, '--limit', '1');
  await cli('run', '--api', api, '--limit', '1');
  assert.equal(requests, 2);
  status = JSON.parse((await cli('status')).stdout);
  assert.deepEqual(status.counts, [{ status: 'done', count: 2 }]);
});
