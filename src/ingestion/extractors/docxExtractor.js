import mammoth from 'mammoth';
export async function extractDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return { text: result.value || '', metadata: { warnings: result.messages?.length || 0 } };
}
