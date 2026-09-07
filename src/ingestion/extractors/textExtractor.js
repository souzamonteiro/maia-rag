import fs from 'node:fs/promises';
export async function extractText(filePath) {
  return { text: await fs.readFile(filePath, 'utf8'), metadata: {} };
}
