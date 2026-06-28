import { spawn } from 'node:child_process';
import { copyFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { customAlphabet } from 'nanoid';
// Engine module (ffprobe duration).
import { getDuration } from '../../../src/lib/ffmpeg.js';
import { ensureDir, existsSync, readJsonOr, removePath, writeJson } from './fsx';
import { ROOT, projectDir } from './paths';
import { HttpError, addElementPlacement, elementsDir as wsElementsDir, getLibrary } from './store';
import type { TextElementStyle } from './schema';

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
  thumb?: string | null; // poster image for video elements (middle frame)
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

// Extract a poster (middle frame) PNG so video elements are identifiable in the
// library. webmAlpha decodes via libvpx so the keyed transparency is preserved.
async function makeThumb(srcAbs: string, durSec: number, outAbs: string, webmAlpha: boolean) {
  const t = Math.max(0, durSec / 2);
  const args: string[] = [];
  if (webmAlpha) args.push('-c:v', 'libvpx-vp9');
  args.push('-ss', t.toFixed(2), '-i', srcAbs, '-frames:v', '1', '-vf', 'scale=320:-2', '-y', outAbs);
  try {
    await runFfmpeg(args);
    return existsSync(outAbs);
  } catch {
    return false;
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
  const durationSec = kind === 'image' ? 0 : await probe(join(GLOBAL_ELEMENTS_DIR, rel));
  let thumb: string | null = null;
  if (kind === 'video') {
    const trel = `${id}-thumb.png`;
    if (await makeThumb(join(GLOBAL_ELEMENTS_DIR, rel), durationSec, join(GLOBAL_ELEMENTS_DIR, trel), false)) {
      thumb = trel;
    }
  }
  const item: ElementItem = {
    id,
    name: originalName,
    file: rel,
    kind,
    sizeBytes: buffer.length,
    durationSec,
    thumb,
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
  if (it.thumb) removePath(join(GLOBAL_ELEMENTS_DIR, it.thumb));
  const next = lib.filter((x) => x.id !== id);
  writeJson(INDEX, next);
  return next;
}

export function renameElement(id: string, name: string): ElementItem[] {
  const lib = getElementLibrary();
  const it = lib.find((x) => x.id === id);
  if (!it) throw new HttpError(404, `Element "${id}" not found.`);
  const trimmed = (name || '').trim();
  if (trimmed) it.name = trimmed;
  writeJson(INDEX, lib);
  return lib;
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
  // Videos/gifs default to their full native length; static images get a 3s window.
  const span = el.kind !== 'image' && el.durationSec > 0 ? el.durationSec : 3;
  const rec = {
    id: pid,
    name: el.name,
    file: rel,
    kind: el.kind,
    layer: Math.max(0, Math.round(layer)),
    x: 50,
    y: 50,
    size: 50,
    rotation: 0,
    startSec: at,
    endSec: Math.round((at + span) * 100) / 100,
    animation: 'none' as const,
    muted: false,
    text: ''
  };
  addElementPlacement(id, rec);
  return rec;
}

// Build the placement record (probe duration, apply the same defaults as
// placeElement) and store it on the manifest. Shared by the project-element
// creation paths below. `abs` is the already-written file's absolute path.
async function addPlacedElement(
  id: string,
  opts: { pid: string; name: string; rel: string; kind: ElementKind; abs: string; layer: number; atSec: number }
) {
  const { pid, name, rel, kind, abs, layer, atSec } = opts;
  const durationSec = kind === 'image' ? 0 : await probe(abs);
  const at = Math.max(0, Math.round(atSec * 100) / 100);
  const span = kind !== 'image' && durationSec > 0 ? durationSec : 3;
  const rec = {
    id: pid,
    name,
    file: rel,
    kind,
    layer: Math.max(0, Math.round(layer)),
    x: 50,
    y: 50,
    size: 50,
    rotation: 0,
    startSec: at,
    endSec: Math.round((at + span) * 100) / 100,
    animation: 'none' as const,
    muted: false,
    text: ''
  };
  addElementPlacement(id, rec);
  return rec;
}

// Place a project-specific uploaded file directly onto this project's timeline
// (no global-library entry). Mirrors placeElement's defaults.
export async function placeUploadedElement(opts: {
  id: string;
  buffer: Buffer;
  originalName: string;
  layer: number;
  atSec: number;
}) {
  const { id, buffer, originalName, layer, atSec } = opts;
  if (!buffer?.length) throw new HttpError(400, 'Empty upload.');
  const kind = kindOf(originalName);
  if (!kind) {
    throw new HttpError(400, `"${originalName}" isn't a supported element — use an image, gif, or video.`);
  }
  ensureDir(wsElementsDir(id));
  const pid = shortId();
  const ext = (originalName.match(/\.[A-Za-z0-9]+$/)?.[0] || '').toLowerCase();
  const rel = `elements/${pid}${ext}`;
  const abs = join(projectDir(id), rel);
  writeFileSync(abs, buffer);
  return addPlacedElement(id, { pid, name: originalName, rel, kind, abs, layer, atSec });
}

// Turn an existing project Asset Library item into a timeline element
// (copy-on-place from the project's library/ folder). Audio is rejected.
export async function placeLibraryItemAsElement(opts: {
  id: string;
  itemId: string;
  layer: number;
  atSec: number;
}) {
  const { id, itemId, layer, atSec } = opts;
  const item = getLibrary(id).find((i) => i.id === itemId);
  if (!item) throw new HttpError(404, `Library item "${itemId}" not found.`);
  if (item.kind === 'audio') throw new HttpError(400, "Audio can't be used as a visual element.");
  const kind = kindOf(item.file) ?? (item.kind === 'video' ? 'video' : 'image');
  ensureDir(wsElementsDir(id));
  const pid = shortId();
  const ext = extname(item.file) || '';
  const rel = `elements/${pid}${ext}`;
  const abs = join(projectDir(id), rel);
  copyFileSync(join(projectDir(id), item.file), abs);
  return addPlacedElement(id, { pid, name: item.name, rel, kind, abs, layer, atSec });
}

// Default styling for a new text element (mirrors the caption defaults).
const DEFAULT_TEXT_STYLE: TextElementStyle = {
  fontFamily: 'Inter',
  fontSize: 72,
  fontWeight: 800,
  color: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 0,
  uppercase: false,
  align: 'center'
};

// Place a text overlay on the timeline. No file — the text + style live on the
// placement record and render via the Remotion <Elements> overlay.
export function placeTextElement(opts: {
  id: string;
  text?: string;
  textStyle?: Partial<TextElementStyle>;
  layer: number;
  atSec: number;
  durationSec?: number;
}) {
  const { id, layer, atSec, durationSec = 3 } = opts;
  const pid = shortId();
  const at = Math.max(0, Math.round(atSec * 100) / 100);
  const text = opts.text?.trim() || 'Your text';
  const rec = {
    id: pid,
    name: 'Text',
    file: null,
    kind: 'text' as const,
    layer: Math.max(0, Math.round(layer)),
    x: 50,
    y: 50,
    size: 100, // full-width wrap; visual size is driven by textStyle.fontSize
    rotation: 0,
    startSec: at,
    endSec: Math.round((at + Math.max(0.5, durationSec)) * 100) / 100,
    animation: 'none' as const,
    muted: false,
    text,
    textStyle: { ...DEFAULT_TEXT_STYLE, ...(opts.textStyle ?? {}) }
  };
  addElementPlacement(id, rec);
  return rec;
}

// ── Background removal (chroma key) on the GLOBAL library ──────────────────────
// Images → transparent PNG. Videos/GIFs → VP9-alpha WebM (Chromium composites
// the alpha in both the editor preview and the Remotion render).
export type BgParams = { color: string; similarity: number; blend: number; despill: boolean };

const PREVIEW_DIR = join(GLOBAL_ELEMENTS_DIR, 'previews');

function chromaVf(p: BgParams): string {
  const hex = (p.color || '#00ff00').replace('#', '').padEnd(6, '0').slice(0, 6).toLowerCase();
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const despillType = b > g && b > r ? 'blue' : 'green';
  const sim = Math.max(0.01, Math.min(1, p.similarity ?? 0.2));
  const blend = Math.max(0, Math.min(1, p.blend ?? 0.1));
  return `chromakey=0x${hex}:${sim}:${blend}` + (p.despill ? `,despill=type=${despillType}` : '');
}

const outExt = (kind: ElementKind) => (kind === 'image' ? '.png' : '.webm');

async function bake(
  srcAbs: string,
  kind: ElementKind,
  params: BgParams,
  outAbs: string,
  opts: { sampleSec?: number; keepAudio?: boolean } = {}
) {
  const vf = chromaVf(params);
  if (kind === 'image') {
    await runFfmpeg(['-i', srcAbs, '-vf', vf, '-frames:v', '1', '-y', outAbs]);
    return;
  }
  // video / gif → transparent VP9 webm (alpha). Keep the source audio (opus) on
  // the full bake so muting can be toggled per placement later; drop it for the
  // quick preview sample.
  const args = ['-i', srcAbs];
  if (opts.sampleSec) args.push('-t', String(opts.sampleSec));
  args.push('-vf', `${vf},format=yuva420p`, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p');
  args.push(opts.keepAudio ? '-c:a' : '-an');
  if (opts.keepAudio) args.push('libopus');
  args.push('-y', outAbs);
  await runFfmpeg(args);
}

// Bake a quick preview (short sample for video) to a temp file under previews/.
export async function previewBackgroundRemoval(elementId: string, params: BgParams): Promise<{ file: string }> {
  const el = getElementLibrary().find((e) => e.id === elementId);
  if (!el) throw new HttpError(404, `Element "${elementId}" not found.`);
  ensureDir(PREVIEW_DIR);
  const ext = outExt(el.kind);
  const rel = `previews/${elementId}${ext}`;
  const out = join(GLOBAL_ELEMENTS_DIR, rel);
  await bake(join(GLOBAL_ELEMENTS_DIR, el.file), el.kind, params, out, {
    sampleSec: el.kind === 'image' ? undefined : 3
  });
  if (!existsSync(out)) throw new HttpError(500, 'Preview produced no output.');
  return { file: rel };
}

// Bake the full keyed result and add it as a NEW library element (original kept).
export async function applyBackgroundRemoval(elementId: string, params: BgParams): Promise<ElementItem> {
  const el = getElementLibrary().find((e) => e.id === elementId);
  if (!el) throw new HttpError(404, `Element "${elementId}" not found.`);
  ensureDir(GLOBAL_ELEMENTS_DIR);
  const id = shortId();
  const ext = outExt(el.kind);
  const rel = `${id}${ext}`;
  const out = join(GLOBAL_ELEMENTS_DIR, rel);
  await bake(join(GLOBAL_ELEMENTS_DIR, el.file), el.kind, params, out, { keepAudio: true });
  if (!existsSync(out)) throw new HttpError(500, 'Background removal produced no output.');
  const baseName = el.name.replace(/\.[^.]+$/, '');
  const outKind: ElementKind = el.kind === 'image' ? 'image' : 'video';
  const durationSec = el.kind === 'image' ? 0 : await probe(out);
  let thumb: string | null = null;
  if (outKind === 'video') {
    const trel = `${id}-thumb.png`;
    if (await makeThumb(out, durationSec, join(GLOBAL_ELEMENTS_DIR, trel), true)) thumb = trel;
  }
  const item: ElementItem = {
    id,
    name: `${baseName} (no bg)`,
    file: rel,
    kind: outKind, // a keyed webm renders as video
    sizeBytes: statSync(out).size,
    durationSec,
    thumb,
    createdAt: new Date().toISOString()
  };
  const lib = getElementLibrary();
  lib.unshift(item);
  writeJson(INDEX, lib);
  removePath(join(GLOBAL_ELEMENTS_DIR, `previews/${elementId}${ext}`)); // tidy preview temp
  return item;
}
