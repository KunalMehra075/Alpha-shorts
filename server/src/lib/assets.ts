import { copyFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
// Engine modules (plain JS from the existing CLI pipeline).
import { searchAssets, searchAsset } from '../../../src/lib/assets.js';
import { downloadFirstFitting } from '../../../src/lib/asset-cache.js';
import { ensureDir, readJsonOr } from './fsx';
import { CONFIG_DIR, workspaceDir } from './paths';
import {
  HttpError,
  assetsDir,
  ensureSceneRows,
  getAssetsState,
  getLibrary,
  getScenes,
  setSceneAssets
} from './store';
import type { AssetRef } from './schema';

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
    sizeBytes: 0
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

// Download (stock) or copy (library) the chosen asset into the workspace, then
// mark it selected with a workspace-relative `file` path served via /media.
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
      copyFileSync(path, join(workspaceDir(id), rel));
      file = rel;
      sizeBytes = statSync(join(workspaceDir(id), rel)).size;
    } else if (ref.libraryPath) {
      const rel = `assets/scene-${sceneNumber}${extFor(ref.kind, ref.libraryPath)}`;
      copyFileSync(ref.libraryPath, join(workspaceDir(id), rel));
      file = rel;
      sizeBytes = statSync(join(workspaceDir(id), rel)).size;
    }
  } catch (err: any) {
    throw new HttpError(502, `Could not fetch asset: ${err?.message ?? err}`);
  }

  const selected: AssetRef = { ...ref, file, sizeBytes };
  return setSceneAssets(id, sceneNumber, { selected });
}

export function clearScene(opts: { id: string; sceneNumber: number }) {
  return setSceneAssets(opts.id, opts.sceneNumber, { selected: null });
}

// Assign a library image/video to a scene (copies it into the workspace assets).
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
    libraryPath: join(workspaceDir(id), item.file),
    file: null,
    sizeBytes: 0
  };
  return selectScene({ id, sceneNumber, ref });
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
  writeFileSync(join(workspaceDir(id), rel), buffer);

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
    sizeBytes: buffer.length
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
