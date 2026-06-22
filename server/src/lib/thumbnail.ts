import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { getDuration } from '../../../src/lib/ffmpeg.js';
import { ensureDir, removePath } from './fsx';
import { workspaceDir } from './paths';
import { HttpError, getRenders, readManifest, setUpload } from './store';
import { GLOBAL_MEDIA_DIR, getMediaLibrary } from './media';
import { defaultImageGenerator } from './image';

// YouTube custom-thumbnail constraints: JPG/PNG, ≤ 2 MB.
const MAX_BYTES = 2 * 1024 * 1024;
const IMG = /\.(jpe?g|png)$/i;

// The thumbnail always lives at workspaces/<id>/thumbnail.<ext>. Clear any
// existing one (extension may differ) before writing a new file.
function clearThumbFile(id: string) {
  for (const ext of ['.jpg', '.jpeg', '.png']) {
    removePath(join(workspaceDir(id), `thumbnail${ext}`));
  }
}

function normalizedExt(file: string): string {
  const ext = (extname(file) || '.jpg').toLowerCase();
  return ext === '.jpeg' ? '.jpg' : ext;
}

// Import a thumbnail uploaded from the user's computer.
export function setThumbnailFromUpload(opts: { id: string; buffer: Buffer; originalName: string }) {
  const { id, buffer, originalName } = opts;
  readManifest(id); // 404 if the workspace is missing
  if (!buffer?.length) throw new HttpError(400, 'Empty file.');
  if (!IMG.test(originalName)) throw new HttpError(400, 'Thumbnail must be a JPG or PNG image.');
  if (buffer.length > MAX_BYTES) {
    throw new HttpError(400, 'Thumbnail must be 2 MB or smaller (YouTube limit).');
  }
  ensureDir(workspaceDir(id));
  clearThumbFile(id);
  const ext = normalizedExt(originalName);
  const rel = `thumbnail${ext}`;
  writeFileSync(join(workspaceDir(id), rel), buffer);
  return setUpload(id, { thumbnail: { file: rel, source: 'import', sizeBytes: buffer.length } });
}

// Copy a thumbnail from the workspace library or the global media library.
export function setThumbnailFromAsset(opts: {
  id: string;
  source: 'library' | 'global';
  itemId: string;
}) {
  const { id, source, itemId } = opts;
  const m = readManifest(id);

  let srcPath: string;
  let name: string;
  if (source === 'global') {
    const g = getMediaLibrary('image').find((x) => x.id === itemId);
    if (!g) throw new HttpError(404, `Global image "${itemId}" not found.`);
    srcPath = join(GLOBAL_MEDIA_DIR, g.file);
    name = g.file;
  } else {
    const item = m.library.find((x) => x.id === itemId);
    if (!item) throw new HttpError(404, `Library item "${itemId}" not found.`);
    if (item.kind !== 'image') throw new HttpError(400, 'Thumbnail must be an image.');
    srcPath = join(workspaceDir(id), item.file);
    name = item.file;
  }

  if (!IMG.test(name)) throw new HttpError(400, 'Thumbnail must be a JPG or PNG image.');
  if (!existsSync(srcPath)) throw new HttpError(404, 'Source image file is missing.');
  const size = statSync(srcPath).size;
  if (size > MAX_BYTES) throw new HttpError(400, 'Thumbnail must be 2 MB or smaller (YouTube limit).');

  ensureDir(workspaceDir(id));
  clearThumbFile(id);
  const ext = normalizedExt(name);
  const rel = `thumbnail${ext}`;
  copyFileSync(srcPath, join(workspaceDir(id), rel));
  return setUpload(id, { thumbnail: { file: rel, source: 'asset', sizeBytes: size } });
}

export function clearThumbnail(id: string) {
  readManifest(id);
  clearThumbFile(id);
  return setUpload(id, { thumbnail: { file: null, source: null, sizeBytes: 0 } });
}

const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_BIN || 'ffprobe';

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err: any) => {
      reject(
        err?.code === 'ENOENT'
          ? new HttpError(500, `Could not find ffmpeg ("${FFMPEG_BIN}"). Install it or set FFMPEG_BIN.`)
          : err
      );
    });
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new HttpError(500, `ffmpeg failed: ${stderr.slice(-300)}`))
    );
  });
}

// Grab a (random) frame from the latest completed render and use it as the
// thumbnail. Used as the auto-default when no custom thumbnail is set.
export async function setThumbnailFromFrame(opts: { id: string; atSec?: number }) {
  const { id } = opts;
  readManifest(id);
  const render = getRenders(id).find((r) => r.status === 'completed' && r.file);
  if (!render?.file) {
    throw new HttpError(400, 'No completed render to grab a frame from — render a video first.');
  }
  const input = join(workspaceDir(id), render.file);
  if (!existsSync(input)) throw new HttpError(404, 'Rendered video file is missing.');

  let duration = 0;
  try {
    duration = await getDuration(input, { video: { ffprobeBin: FFPROBE_BIN } });
  } catch {
    duration = 0;
  }
  // Pick a frame away from the very start/end (those are often fades/black).
  let at = opts.atSec;
  if (at == null) {
    if (duration > 1) {
      const lo = Math.min(0.5, duration * 0.1);
      const hi = Math.max(lo, duration - 0.3);
      at = lo + Math.random() * (hi - lo);
    } else {
      at = 0;
    }
  }
  at = Math.max(0, Math.min(at, Math.max(0, duration - 0.05)));

  ensureDir(workspaceDir(id));
  clearThumbFile(id);
  const rel = 'thumbnail.jpg';
  const out = join(workspaceDir(id), rel);
  // Accurate seek: fast input-seek to a few seconds before the target, then a
  // precise output-seek to land exactly on `at` (so the saved frame matches the
  // scrubber preview). One frame, long edge capped at 1280px.
  const pre = Math.max(0, at - 3);
  const post = at - pre;
  await runFfmpeg([
    '-ss',
    pre.toFixed(3),
    '-i',
    input,
    '-ss',
    post.toFixed(3),
    '-frames:v',
    '1',
    '-vf',
    "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease",
    '-q:v',
    '3',
    '-y',
    out
  ]);
  if (!existsSync(out)) throw new HttpError(500, 'Frame extraction produced no image.');
  return setUpload(id, { thumbnail: { file: rel, source: 'frame', sizeBytes: statSync(out).size } });
}

// Generate a thumbnail with the AI strategy chain (Gemini → OpenAI), then
// recompress to a ≤2 MB JPG via ffmpeg (same recipe as frame grab).
export async function setThumbnailFromGenerated(opts: { id: string; prompt: string }) {
  const { id, prompt } = opts;
  readManifest(id);
  if (!prompt?.trim()) throw new HttpError(400, 'A prompt is required.');

  let result;
  try {
    result = await defaultImageGenerator().generate({ prompt: prompt.trim(), aspect: '9:16' });
  } catch (err: any) {
    throw new HttpError(502, err?.message || 'Image generation failed.');
  }

  ensureDir(workspaceDir(id));
  clearThumbFile(id);
  const srcExt = /jpe?g/.test(result.mime) ? '.jpg' : '.png';
  const srcPath = join(workspaceDir(id), `thumbnail-src${srcExt}`);
  writeFileSync(srcPath, result.buffer);
  const rel = 'thumbnail.jpg';
  const out = join(workspaceDir(id), rel);
  try {
    await runFfmpeg([
      '-i',
      srcPath,
      '-vf',
      "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease",
      '-q:v',
      '3',
      '-y',
      out
    ]);
  } finally {
    removePath(srcPath);
  }
  if (!existsSync(out)) throw new HttpError(500, 'Could not process the generated image.');
  return setUpload(id, { thumbnail: { file: rel, source: 'ai', sizeBytes: statSync(out).size } });
}
