import { config } from '../config/index.js';
import { embed } from '../services/ollamaClient.js';
import { search } from '../services/qdrantStore.js';

export function buildQdrantFilter(options = {}) {
  const must = [];
  if (options.filter?.must) {
    must.push(...options.filter.must);
  }
  if (options.collectionId) {
    must.push({ key: 'collectionId', match: { value: options.collectionId } });
  }
  if (options.documentId) {
    must.push({ key: 'documentId', match: { value: options.documentId } });
  }
  if (options.documentType) {
    must.push({ key: 'documentType', match: { value: options.documentType } });
  }
  if (options.language) {
    must.push({ key: 'language', match: { value: options.language } });
  }
  return must.length > 0 ? { must } : undefined;
}

export async function retrieve(question, options = {}) {
  if (!question || typeof question !== 'string' || !question.trim()) {
    return [];
  }
  const embeddings = await embed(question.trim());
  if (!embeddings || embeddings.length === 0) return [];
  const vector = embeddings[0];

  const filter = buildQdrantFilter(options);
  const candidateK = options.candidateK || config.retrieval.candidateK || 20;
  const topK = options.topK || config.retrieval.topK || 8;
  const minScore = options.minScore ?? config.retrieval.minScore ?? 0.25;

  const results = await search(vector, candidateK, filter);
  return results
    .filter(r => r.score >= minScore)
    .slice(0, topK);
}
