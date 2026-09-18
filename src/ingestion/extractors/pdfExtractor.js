import fs from 'node:fs/promises';
import pdfModule from 'pdf-parse';

const pdf = typeof pdfModule === 'function' ? pdfModule : (pdfModule.default || pdfModule);

export async function extractPdf(filePath) {
  const buf = await fs.readFile(filePath);
  const data = await pdf(buf);
  return {
    text: data.text || '',
    metadata: {
      pages: data.numpages || 1,
      info: data.info || {}
    }
  };
}
