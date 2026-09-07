// MVP heuristic. Replace with Tree-sitter adapters per language in v0.2.
export function chunkCode(text, opts = {}) {
  const maxChars = opts.maxChars || 5000;
  const lines = text.split('\n');
  const chunks = [];
  let current = [], size = 0, startLine = 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (size + line.length > maxChars && current.length) {
      chunks.push({ text: current.join('\n'), startLine, endLine: i });
      current = []; size = 0; startLine = i + 1;
    }
    current.push(line); size += line.length + 1;
  }
  if (current.length) chunks.push({ text: current.join('\n'), startLine, endLine: lines.length });
  return chunks;
}
