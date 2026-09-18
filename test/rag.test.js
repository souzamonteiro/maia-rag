import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from '../src/rag/contextBuilder.js';
import { buildQdrantFilter } from '../src/rag/retriever.js';
import { askRag } from '../src/rag/ragService.js';

test('buildContext formats sources with delimiters and line/chunk info', () => {
  const sources = [
    {
      score: 0.88,
      payload: {
        documentId: 'doc-123',
        filename: 'manual.md',
        startLine: 10,
        endLine: 25,
        text: 'This is section A content.'
      }
    },
    {
      score: 0.75,
      payload: {
        documentId: 'doc-456',
        filename: 'notes.txt',
        chunkIndex: 2,
        text: 'This is notes content.'
      }
    }
  ];

  const context = buildContext(sources);
  assert.ok(context.includes('--- BEGIN SOURCE [1] ---'));
  assert.ok(context.includes('File: manual.md'));
  assert.ok(context.includes('Location: lines 10-25 (similarity: 88.0%)'));
  assert.ok(context.includes('This is section A content.'));
  assert.ok(context.includes('--- END SOURCE [1] ---'));

  assert.ok(context.includes('--- BEGIN SOURCE [2] ---'));
  assert.ok(context.includes('Location: chunk 2 (similarity: 75.0%)'));
});

test('buildContext handles empty sources gracefully', () => {
  assert.equal(buildContext([]), '');
  assert.equal(buildContext(null), '');
});

test('buildQdrantFilter builds valid filter payloads', () => {
  const f1 = buildQdrantFilter({ collectionId: 'coll-1' });
  assert.deepEqual(f1, {
    must: [{ key: 'collectionId', match: { value: 'coll-1' } }]
  });

  const f2 = buildQdrantFilter({
    documentId: 'doc-1',
    documentType: 'source-code'
  });
  assert.deepEqual(f2, {
    must: [
      { key: 'documentId', match: { value: 'doc-1' } },
      { key: 'documentType', match: { value: 'source-code' } }
    ]
  });

  const empty = buildQdrantFilter({});
  assert.equal(empty, undefined);
});
