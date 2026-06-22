import { copyFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { customAlphabet } from 'nanoid';
import { ensureDir } from './fsx';
import { workspaceDir } from './paths';
import { addLibraryItem, HttpError, libraryDir, readManifest } from './store';
import { GLOBAL_MEDIA_DIR, getMediaLibrary } from './media';
import { defaultImageGenerator } from './image';
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

// Generate an image with the AI strategy chain (Gemini → OpenAI) and add it to
// this workspace's library. Always 9:16 to match the Short.
export async function generateLibraryImage(opts: { id: string; prompt: string }): Promise<LibraryItem> {
  const { id, prompt } = opts;
  readManifest(id); // 404 if the workspace is missing
  if (!prompt?.trim()) throw new HttpError(400, 'A prompt is required.');
  let result;
  try {
    result = await defaultImageGenerator().generate({ prompt: prompt.trim(), aspect: '9:16' });
  } catch (err: any) {
    throw new HttpError(502, err?.message || 'Image generation failed.');
  }
  const ext = /jpe?g/.test(result.mime) ? '.jpg' : '.png';
  return addToLibrary({ id, buffer: result.buffer, originalName: `ai-${Date.now()}${ext}` });
}

// Copy a GLOBAL media-library item into this workspace's library.
export function addToLibraryFromGlobal(opts: { id: string; itemId: string }): LibraryItem {
  const { id, itemId } = opts;
  const g = getMediaLibrary().find((m) => m.id === itemId);
  if (!g) throw new HttpError(404, `Global media "${itemId}" not found.`);
  ensureDir(libraryDir(id));
  const ext = extname(g.file) || '';
  const newId = shortId();
  const rel = `library/${newId}${ext}`;
  const dest = join(workspaceDir(id), rel);
  copyFileSync(join(GLOBAL_MEDIA_DIR, g.file), dest);

  const item: LibraryItem = {
    id: newId,
    kind: g.kind,
    file: rel,
    name: g.name,
    sizeBytes: statSync(dest).size,
    createdAt: new Date().toISOString()
  };
  addLibraryItem(id, item);
  return item;
}
