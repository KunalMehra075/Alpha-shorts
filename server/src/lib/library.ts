import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { customAlphabet } from 'nanoid';
import { ensureDir } from './fsx';
import { workspaceDir } from './paths';
import { addLibraryItem, HttpError, libraryDir } from './store';
import type { LibraryItem } from './schema';

const shortId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

const IMG = /\.(jpg|jpeg|png|webp|gif)$/i;
const VID = /\.(mp4|mov|webm|mkv|m4v)$/i;
const AUD = /\.(mp3|wav|m4a|aac|ogg)$/i;

function kindOf(name: string): LibraryItem['kind'] | null {
  if (IMG.test(name)) return 'image';
  if (VID.test(name)) return 'video';
  if (AUD.test(name)) return 'audio';
  return null;
}

// Save a dropped/uploaded media file into the workspace library.
export function addToLibrary(opts: { id: string; buffer: Buffer; originalName: string }): LibraryItem {
  const { id, buffer, originalName } = opts;
  if (!buffer?.length) throw new HttpError(400, 'Empty upload.');
  const kind = kindOf(originalName);
  if (!kind) {
    throw new HttpError(400, `Unsupported file "${originalName}" — use an image, video, or audio file.`);
  }
  ensureDir(libraryDir(id));
  const ext = (originalName.match(/\.[A-Za-z0-9]+$/)?.[0] || '').toLowerCase();
  const itemId = shortId();
  const rel = `library/${itemId}${ext}`;
  writeFileSync(join(workspaceDir(id), rel), buffer);

  const item: LibraryItem = {
    id: itemId,
    kind,
    file: rel,
    name: originalName,
    sizeBytes: buffer.length,
    createdAt: new Date().toISOString()
  };
  addLibraryItem(id, item);
  return item;
}
