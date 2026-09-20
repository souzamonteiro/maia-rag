import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

// HTTP uploads must never enter the directory consumed by the inbox watcher.
export function createDocumentUpload(dataDir, inboxDir) {
  const directory = path.resolve(dataDir, 'http-uploads');
  const relative = path.relative(path.resolve(inboxDir), directory);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('HTTP upload directory must be outside the watched inbox.');
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
  return multer({ dest: directory, limits: { fileSize: 104857600 } });
}

export function originalUploadName(name) {
  // Multipart parsers may interpret browser UTF-8 filenames as Latin-1.
  // Only repair a lossless, valid UTF-8 byte sequence; preserve other names.
  if ([...name].some(char => char.codePointAt(0) > 255)) return name;
  const bytes = Buffer.from(name, 'latin1');
  const decoded = bytes.toString('utf8');
  return Buffer.from(decoded, 'utf8').equals(bytes) ? decoded : name;
}
