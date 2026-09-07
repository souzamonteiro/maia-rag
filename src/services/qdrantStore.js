import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config/index.js';

const client = new QdrantClient({ url: config.qdrant.url });

export async function ensureCollection() {
  const all = await client.getCollections();
  if (!all.collections.some(c => c.name === config.qdrant.collection)) {
    await client.createCollection(config.qdrant.collection, {
      vectors: { size: config.qdrant.vectorSize, distance: config.qdrant.distance }
    });
  }
}

export async function upsertChunks(points) {
  return client.upsert(config.qdrant.collection, { wait: true, points });
}

export async function search(vector, limit = config.retrieval.candidateK, filter) {
  return client.search(config.qdrant.collection, { vector, limit, filter, with_payload: true });
}
