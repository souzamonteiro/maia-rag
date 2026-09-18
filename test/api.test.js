import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/server.js';

test('API endpoints integration test', async (t) => {
  let server;
  let baseUrl;

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  // 1. Health endpoint
  const healthRes = await fetch(`${baseUrl}/api/health`);
  const health = await healthRes.json();
  assert.equal(health.service, 'maia-rag');
  assert.ok(health.components);
  assert.ok(health.components.sqlite);

  // 2. Stats endpoint
  const statsRes = await fetch(`${baseUrl}/api/stats`);
  assert.equal(statsRes.status, 200);
  const stats = await statsRes.json();
  assert.equal(typeof stats.documents, 'number');
  assert.equal(typeof stats.chunks, 'number');

  // 3. Documents list endpoint
  const docsRes = await fetch(`${baseUrl}/api/documents`);
  assert.equal(docsRes.status, 200);
  const docs = await docsRes.json();
  assert.ok(Array.isArray(docs.documents));
  assert.equal(typeof docs.total, 'number');

  // 4. Collections list & create
  const collsRes = await fetch(`${baseUrl}/api/collections`);
  assert.equal(collsRes.status, 200);
  const colls = await collsRes.json();
  assert.ok(Array.isArray(colls));

  const createCollRes = await fetch(`${baseUrl}/api/collections`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'api-test-collection-' + Date.now(), description: 'test' })
  });
  assert.equal(createCollRes.status, 201);
  const createdColl = await createCollRes.json();
  assert.ok(createdColl.id);

  // 5. Validation on Search & Query
  const emptySearch = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(emptySearch.status, 400);

  const emptyQuery = await fetch(`${baseUrl}/api/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(emptyQuery.status, 400);
});

