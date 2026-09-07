import path from 'node:path';
import { classify } from '../../services/ollamaClient.js';

export async function classifyDocument({ filename, text, technicalMetadata }) {
  const sample = text.slice(0, 14000);
  const prompt = `Analyze this document and return one JSON object with:\n` +
    `documentType, language, title, authors(array), year, domains(array of {name,confidence}), ` +
    `keywords(array), programmingLanguages(array), frameworks(array), probableProject, summary, confidence.\n` +
    `Use null/[] when unknown. Filename: ${path.basename(filename)}\nTechnical metadata: ${JSON.stringify(technicalMetadata)}\nCONTENT:\n${sample}`;
  return classify(prompt);
}
