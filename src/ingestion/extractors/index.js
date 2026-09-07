import path from 'node:path';
import { extractText } from './textExtractor.js';
import { extractPdf } from './pdfExtractor.js';
import { extractDocx } from './docxExtractor.js';

const textExt = new Set(['.txt','.md','.markdown','.js','.mjs','.cjs','.ts','.tsx','.jsx','.py','.c','.h','.cpp','.hpp','.java','.go','.rs','.php','.rb','.sh','.css','.html','.htm','.json','.yaml','.yml','.xml','.sql','.maia','.ebnf']);
export async function extractDocument(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return extractPdf(filePath);
  if (ext === '.docx') return extractDocx(filePath);
  if (textExt.has(ext)) return extractText(filePath);
  throw new Error(`Unsupported file type: ${ext || '(none)'}`);
}
