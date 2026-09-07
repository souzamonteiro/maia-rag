import { config } from '../config/index.js';

async function post(path, body) {
  const res = await fetch(`${config.ollama.baseUrl}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Ollama ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function embed(input) {
  const data = await post('/api/embed', { model: config.ollama.embeddingModel, input });
  return data.embeddings;
}

export async function chat(messages, model = config.ollama.chatModel, format) {
  return post('/api/chat', { model, messages, stream: false, ...(format ? { format } : {}) });
}

export async function classify(prompt) {
  const data = await chat([
    { role: 'system', content: 'You classify knowledge documents. Return JSON only. Never invent bibliographic facts.' },
    { role: 'user', content: prompt }
  ], config.ollama.classifierModel, 'json');
  return JSON.parse(data.message.content);
}
