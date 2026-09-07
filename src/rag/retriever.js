import { config } from '../config/index.js';
import { embed } from '../services/ollamaClient.js';
import { search } from '../services/qdrantStore.js';

export async function retrieve(question, options = {}) {
  const [vector] = await embed(question);
  const results = await search(vector, options.candidateK || config.retrieval.candidateK, options.filter);
  return results.filter(r => r.score >= (options.minScore ?? config.retrieval.minScore)).slice(0, options.topK || config.retrieval.topK);
}
