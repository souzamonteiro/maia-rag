import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkText } from '../src/ingestion/chunkers/textChunker.js';
test('chunkText keeps non-empty text', () => { const c=chunkText('A paragraph.\n\nAnother paragraph.',{maxChars:20,overlap:4}); assert.ok(c.length>=1); assert.ok(c.every(Boolean)); });
