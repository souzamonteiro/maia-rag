import path from 'node:path';
import { extractText } from './textExtractor.js';
import { extractPdf } from './pdfExtractor.js';
import { extractDocx } from './docxExtractor.js';
import { extractMarkdown } from './markdownExtractor.js';

const markdownExt = new Set(['.md', '.markdown']);
const textExt = new Set([
  '.txt', '.text', '.csv', '.tsv', '.log', '.env', '.ini', '.conf', '.toml',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.py', '.c', '.h', '.cpp', '.hpp', '.java', '.go', '.rs', '.php', '.rb',
  '.sh', '.bash', '.css', '.scss', '.html', '.htm',
  '.json', '.yaml', '.yml', '.xml', '.sql', '.maia', '.ebnf'
]);

// Multipart uploads have extensionless temporary paths; use the original name
// only to select the extractor, and always read from the actual stored path.
export async function extractDocument(filePath, originalName = filePath) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.pdf') return extractPdf(filePath);
  if (ext === '.docx') return extractDocx(filePath);
  if (markdownExt.has(ext)) return extractMarkdown(filePath);
  if (textExt.has(ext)) return extractText(filePath);
  throw new Error(`Unsupported file type: ${ext || '(no extension)'}`);
}
