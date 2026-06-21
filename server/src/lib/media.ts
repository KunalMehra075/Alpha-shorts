import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { customAlphabet } from 'nanoid';
// Engine module (ffprobe duration).
import { getDuration } from '../../../src/lib/ffmpeg.js';
import { ensureDir, existsSync, readJsonOr, removePath, writeJson } from './fsx';
import { ROOT } from './paths';
import { HttpError } from './store';

const shortId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

// Global, app-level media library (images / videos / music) shared across all
// workspaces. Sibling of the global sound library (see ./sounds.ts).
export const GLOBAL_MEDIA_DIR = join(ROOT, 'media-library');
const INDEX = join(GLOBAL_MEDIA_DIR, 'library.json');

const IMG = /\.(jpg|jpeg|png|webp|gif|avif)$/i;
const VID = /\.(mp4|mov|webm|mkv|m4v)$/i;
const AUD = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;

export type MediaKind = 'image' | 'video' | 'audio';

export type MediaItem = {
  id: string;
  kind: MediaKind;
  file: string; // relative to GLOBAL_MEDIA_DIR
  name: string;
  sizeBytes: number;
  durationSec: number; // 0 for images
  createdAt: string;
};

function kindOf(name: string): MediaKind | null {
  if (IMG.test(name)) return 'image';
  if (VID.test(name)) return 'video';
  if (AUD.test(name)) return 'audio';
  return null;
}

async function probe(path: string): Promise<number> {
  try {
    const s = await getDuration(path, { video: { ffprobeBin: process.env.FFPROBE_BIN || 'ffprobe' } });
    return Math.round(s * 10) / 10;
  } catch {
    return 0;
  }
}

// Read the library (optionally filtered by kind). Empty until the user uploads.
export function getMediaLibrary(kind?: MediaKind): MediaItem[] {
  const all = existsSync(INDEX) ? readJsonOr<MediaItem[]>(INDEX, []) : [];
  return kind ? all.filter((m) => m.kind === kind) : all;
}

export async function addMedia(opts: { buffer: Buffer; originalName: string }): Promise<MediaItem> {
  const { buffer, originalName } = opts;
  if (!buffer?.length) throw new HttpError(400, 'Empty upload.');
  const kind = kindOf(originalName);
  if (!kind) {
    throw new HttpError(400, `Unsupported file "${originalName}" — use an image, video, or audio file.`);
  }
  ensureDir(GLOBAL_MEDIA_DIR);
  const id = shortId();
  const ext = (originalName.match(/\.[A-Za-z0-9]+$/)?.[0] || '').toLowerCase();
  const rel = `${id}${ext}`;
  writeFileSync(join(GLOBAL_MEDIA_DIR, rel), buffer);

  const item: MediaItem = {
    id,
    kind,
    file: rel,
    name: originalName,
    sizeBytes: buffer.length,
    durationSec: kind === 'image' ? 0 : await probe(join(GLOBAL_MEDIA_DIR, rel)),
    createdAt: new Date().toISOString()
  };
  const lib = existsSync(INDEX) ? readJsonOr<MediaItem[]>(INDEX, []) : [];
  lib.unshift(item);
  writeJson(INDEX, lib);
  return item;
}

export function deleteMedia(id: string): MediaItem[] {
  const lib = existsSync(INDEX) ? readJsonOr<MediaItem[]>(INDEX, []) : [];
  const it = lib.find((x) => x.id === id);
  if (!it) throw new HttpError(404, `Media "${id}" not found.`);
  removePath(join(GLOBAL_MEDIA_DIR, it.file));
  const next = lib.filter((x) => x.id !== id);
  writeJson(INDEX, next);
  return next;
}
