export function buildContext(results) {
  return results.map((r, i) => {
    const p = r.payload || {};
    const loc = p.startLine ? `lines ${p.startLine}-${p.endLine}` : `chunk ${p.chunkIndex}`;
    return `[SOURCE ${i + 1}]\nfile: ${p.filename}\nlocation: ${loc}\ndocumentId: ${p.documentId}\n${p.text}`;
  }).join('\n\n');
}
