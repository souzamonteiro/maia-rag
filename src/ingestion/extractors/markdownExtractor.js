import fs from 'node:fs/promises';

export async function extractMarkdown(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  let title = null;
  const h1Match = text.match(/^#\s+([^\n]+)/m);
  if (h1Match) {
    title = h1Match[1].trim();
  } else {
    const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const titleProp = fmMatch[1].match(/title:\s*["']?([^"'\n]+)["']?/);
      if (titleProp) title = titleProp[1].trim();
    }
  }
  return {
    text,
    metadata: {
      format: 'markdown',
      ...(title ? { title } : {})
    }
  };
}

