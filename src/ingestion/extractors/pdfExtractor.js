import fs from 'node:fs/promises';
import pdf from 'pdf-parse';
export async function extractPdf(filePath) {
  const data = await pdf(await fs.readFile(filePath));
  return { text: data.text || '', metadata: { pages: data.numpages, info: data.info || {} } };
}
