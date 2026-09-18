export function buildContext(results) {
  if (!results || results.length === 0) return '';
  return results.map((r, i) => {
    const p = r.payload || {};
    const loc = p.startLine ? `lines ${p.startLine}-${p.endLine}` : `chunk ${p.chunkIndex}`;
    const score = typeof r.score === 'number' ? ` (similarity: ${(r.score * 100).toFixed(1)}%)` : '';
    return `--- BEGIN SOURCE [${i + 1}] ---
File: ${p.filename}
Location: ${loc}${score}
Document ID: ${p.documentId}
Content:
${p.text}
--- END SOURCE [${i + 1}] ---`;
  }).join('\n\n');
}
