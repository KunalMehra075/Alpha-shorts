import { spawn } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { customAlphabet } from 'nanoid';
// Engine module (ffprobe duration).
import { getDuration } from '../../../src/lib/ffmpeg.js';
import { ensureDir, existsSync, readJsonOr, removePath, writeJson } from './fsx';
import { ROOT, projectDir } from './paths';
import {
  HttpError,
  addElementPlacement,
  getElements,
  elementsDir as wsElementsDir,
  setElementChroma
} from './store';
import type { ElementPlacement } from './schema';

const shortId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err: any) =>
      reject(
        err?.code === 'ENOENT'
          ? new HttpError(500, `Could not find ffmpeg ("${FFMPEG_BIN}"). Install it or set FFMPEG_BIN.`)
          : err
      )
    );
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new HttpError(500, `ffmpeg failed: ${stderr.slice(-300)}`))
    );
  });
}

// Global, app-level Elements library (overlay images/gifs/videos shared across
// all projects). Sibling of the global sound + media libraries.
export const GLOBAL_ELEMENTS_DIR = join(ROOT, 'elements');
const INDEX = join(GLOBAL_ELEMENTS_DIR, 'library.json');

// GIF is split into its own kind so the renderer can animate it via <Gif>.
const GIF = /\.gif$/i;
const IMG = /\.(jpg|jpeg|png|webp|avif|svg)$/i;
const VID = /\.(mp4|mov|webm|mkv|m4v)$/i;

export type ElementKind = 'image' | 'gif' | 'video';

export type ElementItem = {
  id: string;
  name: string;
  file: string; // relative to GLOBAL_ELEMENTS_DIR
  kind: ElementKind;
  sizeBytes: number;
  durationSec: number; // 0 for static images
  createdAt: string;
};

function kindOf(name: string): ElementKind | null {
  if (GIF.test(name)) return 'gif';
  if (IMG.test(name)) return 'image';
  if (VID.test(name)) return 'video';
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

export function getElementLibrary(): ElementItem[] {
  return existsSync(INDEX) ? readJsonOr<ElementItem[]>(INDEX, []) : [];
}

export async function addElement(opts: { buffer: Buffer; originalName: string }): Promise<ElementItem> {
  const { buffer, originalName } = opts;
  if (!buffer?.length) throw new HttpError(400, 'Empty upload.');
  const kind = kindOf(originalName);
  if (!kind) {
    throw new HttpError(400, `"${originalName}" isn't a supported element — use an image, gif, or video.`);
  }
  ensureDir(GLOBAL_ELEMENTS_DIR);
  const id = shortId();
  const ext = (originalName.match(/\.[A-Za-z0-9]+$/)?.[0] || '').toLowerCase();
  const rel = `${id}${ext}`;
  writeFileSync(join(GLOBAL_ELEMENTS_DIR, rel), buffer);
  const item: ElementItem = {
    id,
    name: originalName,
    file: rel,
    kind,
    sizeBytes: buffer.length,
    durationSec: kind === 'image' ? 0 : await probe(join(GLOBAL_ELEMENTS_DIR, rel)),
    createdAt: new Date().toISOString()
  };
  const lib = getElementLibrary();
  lib.unshift(item);
  writeJson(INDEX, lib);
  return item;
}

export function deleteElement(id: string): ElementItem[] {
  const lib = getElementLibrary();
  const it = lib.find((x) => x.id === id);
  if (!it) throw new HttpError(404, `Element "${id}" not found.`);
  removePath(join(GLOBAL_ELEMENTS_DIR, it.file));
  const next = lib.filter((x) => x.id !== id);
  writeJson(INDEX, next);
  return next;
}

// Place a global element onto a project's timeline (copy-on-place). Defaults:
// centered, 30% width, 3s long starting at the drop time, no animation.
export function placeElement(opts: { id: string; elementId: string; layer: number; atSec: number }) {
  const { id, elementId, layer, atSec } = opts;
  const el = getElementLibrary().find((e) => e.id === elementId);
  if (!el) throw new HttpError(404, `Element "${elementId}" not found.`);
  ensureDir(wsElementsDir(id));
  const pid = shortId();
  const ext = extname(el.file) || '';
  const rel = `elements/${pid}${ext}`;
  copyFileSync(join(GLOBAL_ELEMENTS_DIR, el.file), join(projectDir(id), rel));
  const at = Math.max(0, Math.round(atSec * 100) / 100);
  const rec = {
    id: pid,
    name: el.name,
    file: rel,
    kind: el.kind,
    layer: Math.max(0, Math.round(layer)),
    x: 50,
    y: 50,
    size: 30,
    rotation: 0,
    startSec: at,
    endSec: Math.round((at + 3) * 100) / 100,
    animation: 'none' as const
  };
  addElementPlacement(id, rec);
  return rec;
}
