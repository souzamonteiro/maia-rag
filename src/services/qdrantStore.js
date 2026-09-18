import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config/index.js';
import { logger } from '../core/logger.js';

export const client = new QdrantClient({
  url: config.qdrant.url,
  checkCompatibility: false
});

export async function ensureCollection() {
  try {
    const all = await client.getCollections();
    if (!all.collections.some(c => c.name === config.qdrant.collection)) {
      logger.info({ collection: config.qdrant.collection }, 'Creating Qdrant collection');
      await client.createCollection(config.qdrant.collection, {
        vectors: {
          size: config.qdrant.vectorSize,
          distance: config.qdrant.distance
        }
      });
      // Create payload indexes for fast filtering
      await client.createPayloadIndex(config.qdrant.collection, {
        field_name: 'documentId',
        field_schema: 'keyword'
      }).catch(() => {});
      await client.createPayloadIndex(config.qdrant.collection, {
        field_name: 'collectionId',
        field_schema: 'keyword'
      }).catch(() => {});
    }
  } catch (err) {
    logger.warn({ error: err.message }, 'Failed to ensure Qdrant collection; verify Qdrant service is running');
    throw err;
  }
}

export async function upsertChunks(points) {
  if (!points || points.length === 0) return { status: 'acknowledged', points: 0 };
  return client.upsert(config.qdrant.collection, { wait: true, points });
}

export async function deleteByDocumentId(documentId) {
  try {
    return await client.delete(config.qdrant.collection, {
      wait: true,
      filter: {
        must: [
          {
            key: 'documentId',
            match: { value: documentId }
          }
        ]
      }
    });
  } catch (err) {
    logger.warn({ documentId, error: err.message }, 'Failed to delete chunks by documentId');
    throw err;
  }
}

export async function search(vector, limit = config.retrieval.candidateK, filter = undefined) {
  const res = await client.query(config.qdrant.collection, {
    query: vector,
    limit,
    filter,
    with_payload: true
  });
  return res.points || [];
}

export async function getChunksByDocumentId(documentId, limit = 100) {
  try {
    const res = await client.scroll(config.qdrant.collection, {
      filter: {
        must: [{ key: 'documentId', match: { value: documentId } }]
      },
      limit,
      with_payload: true,
      with_vector: false
    });
    return res.points || [];
  } catch {
    return [];
  }
}

export async function getCollectionStats() {
  try {
    const info = await client.getCollection(config.qdrant.collection);
    return {
      status: info.status,
      vectorsCount: info.vectors_count ?? info.points_count ?? 0,
      pointsCount: info.points_count ?? 0,
      segmentsCount: info.segments_count ?? 0
    };
  } catch (err) {
    return { status: 'error', error: err.message, pointsCount: 0, vectorsCount: 0 };
  }
}
