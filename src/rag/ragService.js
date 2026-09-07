import { retrieve } from './retriever.js';
import { buildContext } from './contextBuilder.js';
import { chat } from '../services/ollamaClient.js';

export async function askRag(question, options = {}) {
  const sources = await retrieve(question, options);
  const context = buildContext(sources);
  const system = `Answer using the supplied knowledge sources. Cite claims as [1], [2], etc. ` +
    `If the sources are insufficient, explicitly say so. Do not invent source content.\n\n${context}`;
  const response = await chat([{ role: 'system', content: system }, { role: 'user', content: question }], options.model);
  return { answer: response.message.content, sources: sources.map((s, i) => ({ index: i + 1, score: s.score, ...s.payload })) };
}
