import { copyFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
// Engine modules (plain JS from the existing CLI pipeline).
import { searchAssets, searchAsset } from '../../../src/lib/assets.js';
import { downloadFirstFitting } from '../../../src/lib/asset-cache.js';
import { getDuration } from '../../../src/lib/ffmpeg.js';
import { ensureDir, readJsonOr } from './fsx';
import { CONFIG_DIR, projectDir } from './paths';
import {
  HttpError,
  assetsDir,
  ensureSceneRows,
  getAssetsState,
  getLibrary,
  getScenes,
  setSceneAssets,
  updateScene
} from './store';
import { GLOBAL_MEDIA_DIR, getMediaLibrary } from './media';
import { generateLibraryImage } from './library';
import type { AssetRef } from './schema';

// Probe a clip's duration (seconds), rounded to 0.1s. Best-effort → 0 on failure.
async function probeDuration(path: string): Promise<number> {
  try {
    const s = await getDuration(path, { video: { ffprobeBin: process.env.FFPROBE_BIN || 'ffprobe' } });
    return Math.round(s * 10) / 10;
  } catch {
    return 0;
  }
}

const MAX_CANDIDATES = 12;

// Build the engine config from config/video-gen.json + provider keys in the env.
// Providers are only enabled when their API key is present, so a missing key
// just drops that provider (search returns whatever the others find).
function assetConfig() {
  const vg = readJsonOr<any>(join(CONFIG_DIR, 'video-gen.json'), {});
  const assets = vg.assets ?? {
    providers: ['library', 'pexels', 'pixabay'],
    perKeywordResults: 15,
    downloadTimeoutMs: 60000,
    scoring: {
      videoBonus: 40,
      portraitBonus: 60,
      landscapeBonus: 25,
      squareBonus: 10,
      relevanceWeight: 12,
      resolutionWeight: 8,
      popularityWeight: 6,
      libraryBonus: 100
    }
  };
  return {
    assets,
    providers: {
      pexels: { enabled: !!process.env.PEXELS_API_KEY, apiKey: process.env.PEXELS_API_KEY },
      pixabay: { enabled: !!process.env.PIXABAY_API_KEY, apiKey: process.env.PIXABAY_API_KEY }
    }
  };
}

export function providersEnabled() {
  return !!process.env.PEXELS_API_KEY || !!process.env.PIXABAY_API_KEY;
}

// Engine candidate -> dashboard AssetRef (not yet downloaded; `file` is null).
function toRef(c: any): AssetRef {
  return {
    origin: c.source === 'library' ? 'library' : 'stock',
    source: c.source,
    kind: c.type,
    label: c.label ?? '',
    width: c.width ?? 0,
    height: c.height ?? 0,
    orientation: c.orientation ?? 'unknown',
    thumbUrl: c.thumb || (c.type === 'image' ? c.downloadUrl ?? '' : ''),
    downloadUrl: c.downloadUrl ?? null,
    downloadUrls: Array.isArray(c.downloadUrls)
      ? c.downloadUrls
      : c.downloadUrl
        ? [c.downloadUrl]
        : [],
    libraryPath: c.libraryPath ?? null,
    file: null,
    sizeBytes: 0,
    sourceDurationSec: 0,
    trimStartSec: 0,
    trimEndSec: null
  };
}

function extFor(kind: 'video' | 'image', from: string) {
  const ext = extname(from).toLowerCase();
  if (ext && ext.length <= 5) return ext;
  return kind === 'video' ? '.mp4' : '.jpg';
}

// Search stock/library candidates for a scene; cache them on the scene row.
export async function searchScene(opts: {
  id: string;
  sceneNumber: number;
  keywords: string[];
}) {
  const { id, sceneNumber, keywords } = opts;
  ensureSceneRows(id);
  const candidates = await searchAssets({ keywords, config: assetConfig() });
  const refs = candidates.slice(0, MAX_CANDIDATES).map(toRef);
  setSceneAssets(id, sceneNumber, { keywords, candidates: refs });
  return getAssetsState(id);
}

// Download (stock) or copy (library) the chosen asset into the project, then
// mark it selected with a project-relative `file` path served via /media.
export async function selectScene(opts: {
  id: string;
  sceneNumber: number;
  ref: AssetRef;
}) {
  const { id, sceneNumber, ref } = opts;
  ensureDir(assetsDir(id));

  let file = ref.file;
  let sizeBytes = ref.sizeBytes;

  // Try renditions best→worst, keeping the first within the size cap.
  const urls = ref.downloadUrls?.length ? ref.downloadUrls : ref.downloadUrl ? [ref.downloadUrl] : [];

  try {
    if (urls.length) {
      const { path } = await downloadFirstFitting({
        urls,
        kind: ref.kind,
        config: assetConfig()
      });
      const rel = `assets/scene-${sceneNumber}${extFor(ref.kind, path)}`;
      copyFileSync(path, join(projectDir(id), rel));
      file = rel;
      sizeBytes = statSync(join(projectDir(id), rel)).size;
    } else if (ref.libraryPath) {
      const rel = `assets/scene-${sceneNumber}${extFor(ref.kind, ref.libraryPath)}`;
      copyFileSync(ref.libraryPath, join(projectDir(id), rel));
      file = rel;
      sizeBytes = statSync(join(projectDir(id), rel)).size;
    }
  } catch (err: any) {
    throw new HttpError(502, `Could not fetch asset: ${err?.message ?? err}`);
  }

  // For videos, probe the full source length so the trim UI/clamp has a ceiling.
  let sourceDurationSec = ref.sourceDurationSec ?? 0;
  if (ref.kind === 'video' && file) {
    sourceDurationSec = await probeDuration(join(projectDir(id), file));
  }

  const selected: AssetRef = { ...ref, file, sizeBytes, sourceDurationSec };
  return setSceneAssets(id, sceneNumber, { selected });
}

export function clearScene(opts: { id: string; sceneNumber: number }) {
  return setSceneAssets(opts.id, opts.sceneNumber, { selected: null });
}

// Assign a library image/video to a scene (copies it into the project assets).
export async function selectSceneFromLibrary(opts: { id: string; sceneNumber: number; itemId: string }) {
  const { id, sceneNumber, itemId } = opts;
  const item = getLibrary(id).find((i) => i.id === itemId);
  if (!item) throw new HttpError(404, `Library item "${itemId}" not found.`);
  if (item.kind === 'audio') throw new HttpError(400, 'Audio files can’t be a scene visual — use them as background music.');

  const ref: AssetRef = {
    origin: 'library',
    source: 'library',
    kind: item.kind,
    label: item.name,
    width: 0,
    height: 0,
    orientation: 'unknown',
    thumbUrl: '',
    downloadUrl: null,
    downloadUrls: [],
    libraryPath: join(projectDir(id), item.file),
    file: null,
    sizeBytes: 0,
    sourceDurationSec: 0,
    trimStartSec: 0,
    trimEndSec: null
  };
  return selectScene({ id, sceneNumber, ref });
}

// Generate an image (AI chain) into the project library AND select it for the
// scene — one backend call. Returns the new library item + updated assets state.
export async function generateSceneImage(opts: { id: string; sceneNumber: number; prompt: string }) {
  const { id, sceneNumber, prompt } = opts;
  const item = await generateLibraryImage({ id, prompt });
  const assets = await selectSceneFromLibrary({ id, sceneNumber, itemId: item.id });
  return { item, assets };
}

// Assign a GLOBAL media-library image/video to a scene (copies it into the
// project assets). Mirrors selectSceneFromLibrary but resolves from the
// app-level media library (server/src/lib/media.ts).
export async function selectSceneFromGlobal(opts: { id: string; sceneNumber: number; itemId: string }) {
  const { id, sceneNumber, itemId } = opts;
  const item = getMediaLibrary().find((i) => i.id === itemId);
  if (!item) throw new HttpError(404, `Global media "${itemId}" not found.`);
  if (item.kind === 'audio') throw new HttpError(400, 'Audio files can’t be a scene visual — use them as background music.');

  const ref: AssetRef = {
    origin: 'library',
    source: 'library',
    kind: item.kind,
    label: item.name,
    width: 0,
    height: 0,
    orientation: 'unknown',
    thumbUrl: '',
    downloadUrl: null,
    downloadUrls: [],
    libraryPath: join(GLOBAL_MEDIA_DIR, item.file),
    file: null,
    sizeBytes: 0,
    sourceDurationSec: item.durationSec ?? 0,
    trimStartSec: 0,
    trimEndSec: null
  };
  return selectScene({ id, sceneNumber, ref });
}

// Set/clamp the video trim window on a scene's selected asset AND sync the
// scene's playback length to the window. Right-bar duration edits also use this
// (keep trimStart, set trimEnd = trimStart + newDuration → "trim from the end").
export async function setSceneTrim(opts: {
  id: string;
  sceneNumber: number;
  trimStartSec: number;
  trimEndSec: number;
}) {
  const { id, sceneNumber } = opts;
  const row = getAssetsState(id).scenes.find((r) => r.sceneNumber === sceneNumber);
  const selected = row?.selected ?? null;
  if (!selected || !selected.file) throw new HttpError(400, 'Scene has no selected asset to trim.');
  if (selected.kind !== 'video') throw new HttpError(400, 'Only video assets can be trimmed.');

  const source =
    selected.sourceDurationSec && selected.sourceDurationSec > 0
      ? selected.sourceDurationSec
      : await probeDuration(join(projectDir(id), selected.file));

  let start = Math.max(0, opts.trimStartSec);
  let end = opts.trimEndSec;
  if (source > 0) end = Math.min(end, source);
  // Enforce 0.5s..60s window.
  end = Math.min(end, start + 60);
  if (end - start < 0.5) end = start + 0.5;
  if (source > 0 && end > source) {
    end = source;
    start = Math.max(0, end - Math.min(60, end));
  }
  start = Math.round(start * 100) / 100;
  end = Math.round(end * 100) / 100;

  const next: AssetRef = { ...selected, sourceDurationSec: source, trimStartSec: start, trimEndSec: end };
  setSceneAssets(id, sceneNumber, { selected: next });
  // Sync scene length to the trimmed window.
  updateScene(id, sceneNumber, { durationSec: Math.max(0.5, end - start) });
  return getAssetsState(id);
}

export function saveSceneMeta(opts: {
  id: string;
  sceneNumber: number;
  keywords: string[];
  imagePrompt: string;
}) {
  const { id, sceneNumber, keywords, imagePrompt } = opts;
  return setSceneAssets(id, sceneNumber, { keywords, imagePrompt });
}

const VIDEO_RE = /\.(mp4|mov|webm|mkv|m4v)$/i;
const MEDIA_RE = /\.(mp4|mov|webm|mkv|m4v|jpg|jpeg|png|webp|gif)$/i;

export function uploadScene(opts: {
  id: string;
  sceneNumber: number;
  buffer: Buffer;
  originalName: string;
}) {
  const { id, sceneNumber, buffer, originalName } = opts;
  if (!buffer?.length) throw new HttpError(400, 'Empty upload.');
  ensureDir(assetsDir(id));

  const kind: 'video' | 'image' = VIDEO_RE.test(originalName) ? 'video' : 'image';
  const ext = (originalName.match(MEDIA_RE)?.[0] || (kind === 'video' ? '.mp4' : '.jpg')).toLowerCase();
  const rel = `assets/scene-${sceneNumber}${ext}`;
  writeFileSync(join(projectDir(id), rel), buffer);

  const selected: AssetRef = {
    origin: 'upload',
    source: 'upload',
    kind,
    label: originalName,
    width: 0,
    height: 0,
    orientation: 'unknown',
    thumbUrl: '',
    downloadUrl: null,
    downloadUrls: [],
    libraryPath: null,
    file: rel,
    sizeBytes: buffer.length,
    sourceDurationSec: 0, // probed lazily on first trim
    trimStartSec: 0,
    trimEndSec: null
  };
  return setSceneAssets(id, sceneNumber, { selected });
}

// Best-effort fill: for each scene without a selection, pick + download the top
// ranked candidate for its keywords. One search call per unfilled scene.
export async function autofill(opts: { id: string }) {
  const { id } = opts;
  ensureSceneRows(id);
  const scenes = getScenes(id); // keywords live on the canonical breakdown
  const selectedByNum = new Map(getAssetsState(id).scenes.map((r) => [r.sceneNumber, r.selected]));

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const num = sc.scene ?? i + 1;
    if (selectedByNum.get(num)) continue; // already has an asset
    const keywords = sc.searchKeywords ?? [];
    if (!keywords.length) continue;
    const best = await searchAsset({ keywords, config: assetConfig() });
    if (!best) continue;
    await selectScene({ id, sceneNumber: num, ref: toRef(best) });
  }
  return getAssetsState(id);
}
