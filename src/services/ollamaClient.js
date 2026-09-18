import { config } from '../config/index.js';
import { logger } from '../core/logger.js';

async function post(path, body, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.ollama.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`Ollama ${path} failed (${res.status}): ${errorText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function isHealthy() {
  try {
    const res = await fetch(`${config.ollama.baseUrl}/api/tags`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels() {
  try {
    const res = await fetch(`${config.ollama.baseUrl}/api/tags`, { method: 'GET' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}

export async function embed(input, options = {}) {
  const model = options.model || config.ollama.embeddingModel;
  const items = Array.isArray(input) ? input : [input];
  if (items.length === 0) return [];

  const batchSize = options.batchSize || config.ollama.batchSize || 16;
  const allEmbeddings = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const data = await post('/api/embed', { model, input: batch }, 120000);
    if (!data.embeddings || data.embeddings.length === 0) {
      throw new Error(`Ollama embed returned empty embeddings for batch ${i}`);
    }
    allEmbeddings.push(...data.embeddings);
  }

  return allEmbeddings;
}

export async function chat(messages, model = config.ollama.chatModel, format) {
  const availableModels = await listModels();
  let chosenModel = model;

  // Fallback to first available model if requested model is not found
  if (availableModels.length > 0 && !availableModels.some(m => m.name === model || m.name.startsWith(model))) {
    const fallback = availableModels.find(m => !m.name.includes('embedding')) || availableModels[0];
    if (fallback) {
      logger.warn({ requested: model, fallback: fallback.name }, 'Requested model not found, falling back');
      chosenModel = fallback.name;
    }
  }

  return post('/api/chat', {
    model: chosenModel,
    messages,
    stream: false,
    ...(format ? { format } : {})
  }, 120000);
}

function extractJson(rawText) {
  if (!rawText) return {};
  const cleaned = rawText.trim();
  // Strip markdown code fences if present
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const target = match ? match[1] : cleaned;
  return JSON.parse(target);
}

export async function classify(prompt) {
  try {
    const data = await chat([
      {
        role: 'system',
        content: 'You classify knowledge documents. Return strict valid JSON only without markdown formatting. Never invent bibliographic facts.'
      },
      { role: 'user', content: prompt }
    ], config.ollama.classifierModel, 'json');

    const content = data.message?.content || '{}';
    return extractJson(content);
  } catch (err) {
    logger.warn({ error: err.message }, 'AI classification failed; falling back to empty metadata');
    return {
      documentType: 'unknown',
      language: 'unknown',
      title: null,
      authors: [],
      year: null,
      domains: [],
      keywords: [],
      confidence: 0.0,
      classificationError: err.message
    };
  }
}
