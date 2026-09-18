import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { extractDocument } from '../src/ingestion/extractors/index.js';
import { extractMarkdown } from '../src/ingestion/extractors/markdownExtractor.js';
import { extractText } from '../src/ingestion/extractors/textExtractor.js';

test('extractText reads plain text file', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-test-'));
  const file = path.join(tmpDir, 'test.txt');
  await fs.writeFile(file, 'Hello Maia RAG', 'utf8');

  const res = await extractText(file);
  assert.equal(res.text, 'Hello Maia RAG');
  assert.deepEqual(res.metadata, {});

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('extractMarkdown extracts title from H1 header', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-test-'));
  const file = path.join(tmpDir, 'doc.md');
  await fs.writeFile(file, '# Project Architecture\n\nSome body text here.', 'utf8');

  const res = await extractMarkdown(file);
  assert.equal(res.metadata.format, 'markdown');
  assert.equal(res.metadata.title, 'Project Architecture');
  assert.ok(res.text.includes('Some body text here.'));

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('extractMarkdown extracts title from YAML frontmatter', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-test-'));
  const file = path.join(tmpDir, 'post.md');
  await fs.writeFile(file, '---\ntitle: Frontmatter Title\n---\n\nContent here.', 'utf8');

  const res = await extractMarkdown(file);
  assert.equal(res.metadata.format, 'markdown');
  assert.equal(res.metadata.title, 'Frontmatter Title');

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('extractDocument routes by extension correctly', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-test-'));
  const mdFile = path.join(tmpDir, 'note.md');
  await fs.writeFile(mdFile, '# Note\nBody', 'utf8');

  const doc = await extractDocument(mdFile);
  assert.equal(doc.metadata.format, 'markdown');

  const unknownFile = path.join(tmpDir, 'test.bin');
  await fs.writeFile(unknownFile, 'binary', 'utf8');
  await assert.rejects(
    async () => extractDocument(unknownFile),
    /Unsupported file type/
  );

  await fs.rm(tmpDir, { recursive: true, force: true });
});


test('extensionless uploads use the original filename to select the extractor', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-upload-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const uploaded = path.join(dir, 'random-upload-id');
  await fs.writeFile(uploaded, '# Maia Chat\n\nProject documentation.');
  const result = await extractDocument(uploaded, 'README.MD');
  assert.equal(result.metadata.format, 'markdown');
  assert.equal(result.metadata.title, 'Maia Chat');
  assert.match(result.text, /Project documentation/);
  await assert.rejects(extractDocument(uploaded, 'README.exe'), /Unsupported file type: .exe/);
  await assert.rejects(extractDocument(uploaded), /no extension/);
});
