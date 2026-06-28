import { copyFileSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { customAlphabet } from 'nanoid';
// Engine module (plain JS from the CLI pipeline).
import { renderVideo } from '../../../src/lib/remotion-render.js';
import { ensureDir, existsSync, readJsonOr } from './fsx';
import { CONFIG_DIR, ROOT, projectDir } from './paths';
import {
  HttpError,
  addRender,
  getAssetsState,
  getAudioState,
  getCaptions,
  getElements,
  getLibrary,
  getMusic,
  getRenders,
  getScenes,
  getSounds,
  musicDir,
  rendersDir,
  setProjectMusic,
  updateRender
} from './store';
import { GLOBAL_MEDIA_DIR, getMediaLibrary } from './media';
import type { RenderRecord } from './schema';

const shortId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

const REMOTION_PUBLIC = join(ROOT, 'remotion', 'public');
const STAGE_DIR = join(REMOTION_PUBLIC, 'assets');

// ── Dashboard → engine effect/transition vocab ───────────────────────────────
const IMAGE_EFFECT_MAP: Record<string, string> = {
  'Zoom In': 'kenburns-in',
  'Zoom Out': 'kenburns-out',
  'Pan Left': 'pan-left',
  'Pan Right': 'pan-right',
  'Ken Burns': 'kenburns-in',
  Parallax: 'parallax',
  'Slow Rotate': 'parallax',
  'Depth Effect': 'parallax'
};
const VIDEO_EFFECT_MAP: Record<string, string> = {
  'Slow Zoom': 'zoom-in',
  'Crop and Scale': 'zoom-in',
  'Speed Adjustment': 'zoom-in',
  'Motion Blur': 'drift',
  'Dynamic Focus': 'zoom-out',
  'Zoom In': 'zoom-in',
  'Zoom Out': 'zoom-out'
};
const TRANSITION_MAP: Record<string, string> = {
  Fade: 'fade',
  Crossfade: 'fade',
  'Blur Transition': 'fade',
  Zoom: 'zoom',
  'Scale Transition': 'zoom',
  'Slide Left': 'slide-left',
  Push: 'slide-left',
  'Slide Right': 'slide-right'
};

const mapEffect = (name: string, kind: 'video' | 'image') =>
  kind === 'video'
    ? VIDEO_EFFECT_MAP[name] ?? 'zoom-in'
    : IMAGE_EFFECT_MAP[name] ?? 'kenburns-in';
const mapTransition = (name: string) => TRANSITION_MAP[name] ?? 'fade';

// Mirror of the engine's animation-kind heuristic for asset-less scenes.
function inferAnimationKind(keywords: string[], spokenLine: string) {
  const text = `${(keywords || []).join(' ')} ${spokenLine || ''}`.toLowerCase();
  if (/\?|question|mystery|why|how|what if/.test(text)) return 'question';
  if (/scien|brain|neuron|atom|space|galaxy|dna|physics|chemi|tech/.test(text)) return 'science';
  if (/ancient|wisdom|temple|veda|spiritual|sage|myth|sacred|dharma|god/.test(text)) return 'wisdom';
  return 'generic';
}

function loadVideoConfig() {
  const vg = readJsonOr<any>(join(CONFIG_DIR, 'video-gen.json'), {});
  return {
    render: vg.render ?? { width: 1080, height: 1920, fps: 30, codec: 'h264', crf: 18, imageFormat: 'jpeg' },
    transitions: vg.transitions ?? { durationMs: 500 }
  };
}

function freshStageDir() {
  rmSync(STAGE_DIR, { recursive: true, force: true });
  mkdirSync(STAGE_DIR, { recursive: true });
}

// Copy a project file into the Remotion public/assets dir, returning the
// staticFile-relative path (forward slashes).
function stage(absPath: string, name: string) {
  const ext = extname(absPath) || '';
  copyFileSync(absPath, join(STAGE_DIR, `${name}${ext}`));
  return `assets/${name}${ext}`;
}

export type RenderTimeline = {
  scenes: {
    index: number;
    effect: string;
    transition: string;
    durationSec: number;
    motion?: string;
    zoom?: number;
    intensity?: number;
  }[];
  captionsEnabled: boolean;
  preset: string | null;
  music?: { enabled: boolean; volume: number; fadeIn: boolean; fadeOut: boolean };
  soundsEnabled?: boolean;
};

const MUSIC_RE = /\.(mp3|wav|m4a|aac|ogg)$/i;

// Save an uploaded background-music track into the project.
export function saveMusic(opts: { id: string; buffer: Buffer; originalName: string }) {
  const { id, buffer, originalName } = opts;
  if (!buffer?.length) throw new HttpError(400, 'Empty upload.');
  ensureDir(musicDir(id));
  const ext = (originalName.match(MUSIC_RE)?.[0] || '.mp3').toLowerCase();
  const rel = `music/track${ext}`;
  writeFileSync(join(projectDir(id), rel), buffer);
  return setProjectMusic(id, { file: rel, name: originalName }).music;
}

export function clearMusic(opts: { id: string }) {
  const cur = getMusic(opts.id);
  if (cur.file) rmSync(join(projectDir(opts.id), cur.file), { force: true });
  return setProjectMusic(opts.id, { file: null, name: '' }).music;
}

// Use a library audio item as the background-music track.
export function setMusicFromLibrary(opts: { id: string; itemId: string }) {
  const { id, itemId } = opts;
  const item = getLibrary(id).find((i) => i.id === itemId);
  if (!item) throw new HttpError(404, `Library item "${itemId}" not found.`);
  if (item.kind !== 'audio') throw new HttpError(400, 'Only audio files can be background music.');
  ensureDir(musicDir(id));
  const ext = extname(item.file) || '.mp3';
  const rel = `music/track${ext}`;
  copyFileSync(join(projectDir(id), item.file), join(projectDir(id), rel));
  return setProjectMusic(id, { file: rel, name: item.name }).music;
}

// Use a GLOBAL media-library audio item as the background-music track.
export function setMusicFromGlobal(opts: { id: string; itemId: string }) {
  const { id, itemId } = opts;
  const item = getMediaLibrary().find((m) => m.id === itemId);
  if (!item) throw new HttpError(404, `Global media "${itemId}" not found.`);
  if (item.kind !== 'audio') throw new HttpError(400, 'Only audio files can be background music.');
  ensureDir(musicDir(id));
  const ext = extname(item.file) || '.mp3';
  const rel = `music/track${ext}`;
  copyFileSync(join(GLOBAL_MEDIA_DIR, item.file), join(projectDir(id), rel));
  return setProjectMusic(id, { file: rel, name: item.name }).music;
}

// Build the Remotion composition inputProps from the user's manifest choices +
// the editor timeline. Stages all referenced files into remotion/public/assets.
function buildInputProps(id: string, timeline: RenderTimeline) {
  const scenes = getScenes(id);
  if (!scenes.length) throw new HttpError(400, 'No scenes to render — build the scene breakdown in the Assets step first.');

  const assets = getAssetsState(id);
  const caps = getCaptions(id);
  const audio = getAudioState(id);
  const cfg = loadVideoConfig();
  const fps = cfg.render.fps ?? 30;
  const transitionFrames = Math.max(1, Math.round(((cfg.transitions.durationMs ?? 500) / 1000) * fps));

  const tlByIndex = new Map(timeline.scenes.map((s) => [s.index, s]));

  freshStageDir();

  let from = 0;
  const outScenes = scenes.map((sc: any, i: number) => {
    const num = sc.scene ?? i + 1;
    const tl = tlByIndex.get(i);
    const durationSec = Math.max(0.5, tl?.durationSec ?? sc.end - sc.start);
    const durationInFrames = Math.max(1, Math.round(durationSec * fps));
    const selected = assets.scenes.find((r) => r.sceneNumber === num)?.selected ?? null;

    let visualType: 'image' | 'video' | 'animation' = 'animation';
    let sceneAssets: { type: string; src: string }[] = [];
    let effect: string | null = null;
    let animationKind: string | null = null;

    if (selected?.file && existsSync(join(projectDir(id), selected.file))) {
      const kind = selected.kind === 'video' ? 'video' : 'image';
      visualType = kind;
      const src = stage(join(projectDir(id), selected.file), `scene-${i}`);
      const asset: { type: string; src: string; trimStartFrames?: number; trimEndFrames?: number } = { type: kind, src };
      // Video trim window → frame offsets for Remotion's OffthreadVideo.
      if (kind === 'video' && (selected.trimStartSec || selected.trimEndSec != null)) {
        const ts = Math.max(0, selected.trimStartSec ?? 0);
        asset.trimStartFrames = Math.round(ts * fps);
        if (selected.trimEndSec != null) asset.trimEndFrames = Math.round(selected.trimEndSec * fps);
      }
      sceneAssets = [asset];
      effect = mapEffect(tl?.effect ?? '', kind);
    } else {
      animationKind = inferAnimationKind(sc.searchKeywords ?? [], sc.spokenLine ?? '');
    }

    const scene = {
      index: i,
      visualType,
      from,
      durationInFrames,
      spokenLine: sc.spokenLine ?? '',
      keywords: sc.searchKeywords ?? [],
      transitionIn: mapTransition(tl?.transition ?? 'Fade'),
      effect,
      animationKind,
      motion: tl?.motion ?? 'cinematic',
      zoom: tl?.zoom ?? 50,
      intensity: tl?.intensity ?? 50,
      assets: sceneAssets
    };
    from += durationInFrames;
    return scene;
  });

  // Narration: stage the current audio take, if any.
  let narration: string | null = null;
  if (audio.currentVersion != null) {
    const take = audio.versions.find((v) => v.version === audio.currentVersion);
    const abs = take && join(projectDir(id), take.file);
    if (abs && existsSync(abs)) narration = stage(abs, 'narration');
  }

  const captions =
    timeline.captionsEnabled && caps.hasTranscript && caps.lines.length
      ? { enabled: true, lines: caps.lines, settings: caps.settings }
      : null;

  // Background music: staged from the project track when enabled.
  let music: { src: string; volume: number; fadeIn: boolean; fadeOut: boolean } | null = null;
  const mus = getMusic(id);
  if (timeline.music?.enabled && mus.file && existsSync(join(projectDir(id), mus.file))) {
    music = {
      src: stage(join(projectDir(id), mus.file), 'music'),
      volume: Math.max(0, Math.min(1, (timeline.music.volume ?? 30) / 100)),
      fadeIn: !!timeline.music.fadeIn,
      fadeOut: !!timeline.music.fadeOut
    };
  }

  // Sound effects placed on the timeline (staged like other media).
  let sounds: { src: string; atSec: number; volume: number }[] = [];
  if (timeline.soundsEnabled !== false) {
    sounds = getSounds(id)
      .filter((p) => existsSync(join(projectDir(id), p.file)))
      .map((p, i) => ({
        src: stage(join(projectDir(id), p.file), `sound-${i}`),
        atSec: p.atSec,
        volume: p.volume ?? 1
      }));
  }

  // Visual overlay elements placed on the timeline (staged like other media).
  // Sorted by layer so later (higher) layers render on top; endSec clamped to
  // the total video length.
  const totalSec = from / fps;
  const elements = getElements(id)
    // Text elements have no file; media elements must have an existing file.
    .filter((p) => p.kind === 'text' || (p.file && existsSync(join(projectDir(id), p.file))))
    .slice()
    .sort((a, b) => a.layer - b.layer)
    .map((p, i) => {
      const base = {
        kind: p.kind,
        x: p.x,
        y: p.y,
        size: p.size,
        rotation: p.rotation,
        fromSec: Math.max(0, p.startSec),
        toSec: Math.min(p.endSec, totalSec),
        animation: p.animation,
        muted: p.muted
      };
      if (p.kind === 'text') {
        return { ...base, text: p.text, textStyle: p.textStyle };
      }
      return { ...base, src: stage(join(projectDir(id), p.file!), `element-${i}`) };
    })
    .filter((e) => e.toSec > e.fromSec);

  return {
    width: cfg.render.width ?? 1080,
    height: cfg.render.height ?? 1920,
    fps,
    durationInFrames: Math.max(1, from),
    transitionFrames,
    narration,
    music,
    captions,
    sounds,
    elements,
    scenes: outScenes,
    _config: cfg
  };
}

// ── Job manager (one render at a time; in-memory live progress) ───────────────
type Live = { progress: number; phase: string };
const active = new Map<string, Live>();
let busy = false;
const key = (id: string, rid: string) => `${id}:${rid}`;

export function startRender(id: string, timeline: RenderTimeline): RenderRecord {
  if (busy) throw new HttpError(409, 'A render is already in progress. Please wait for it to finish.');
  if (!getScenes(id).length) {
    throw new HttpError(400, 'No scenes to render — build the scene breakdown in the Assets step first.');
  }

  const rid = shortId();
  const rec: RenderRecord = {
    id: rid,
    status: 'rendering',
    progress: 0,
    phase: 'bundling',
    file: null,
    durationSec: 0,
    fps: 30,
    resolution: '1080×1920',
    sizeBytes: 0,
    preset: timeline.preset ?? null,
    createdAt: new Date().toISOString()
  };
  addRender(id, rec);
  busy = true;
  active.set(key(id, rid), { progress: 0, phase: 'bundling' });

  // Fire-and-forget — the request returns immediately; the client polls.
  void runRender(id, rid, timeline);
  return rec;
}

async function runRender(id: string, rid: string, timeline: RenderTimeline) {
  const k = key(id, rid);
  try {
    const inputProps = buildInputProps(id, timeline);
    const cfg = inputProps._config;
    ensureDir(rendersDir(id));
    const rel = `renders/render-${rid}.mp4`;
    const outPath = join(projectDir(id), rel);

    await renderVideo({
      inputProps,
      config: cfg,
      outPath,
      onProgress: (p) => active.set(k, { progress: p.progress, phase: p.phase })
    });

    const sizeBytes = statSync(outPath).size;
    const durationSec = Math.round((inputProps.durationInFrames / inputProps.fps) * 10) / 10;
    updateRender(id, rid, {
      status: 'completed',
      progress: 100,
      phase: 'rendering',
      file: rel,
      sizeBytes,
      durationSec,
      fps: inputProps.fps,
      completedAt: new Date().toISOString()
    });
  } catch (err: any) {
    updateRender(id, rid, { status: 'failed', error: String(err?.message ?? err) });
  } finally {
    busy = false;
    active.delete(k);
  }
}

// Records with live progress overlaid; sweeps records orphaned by a restart.
export function listRenders(id: string): RenderRecord[] {
  let recs = getRenders(id);
  let changed = false;
  for (const r of recs) {
    if (r.status === 'rendering' && !active.has(key(id, r.id))) {
      updateRender(id, r.id, { status: 'failed', error: 'Render interrupted (server restarted).' });
      changed = true;
    }
  }
  if (changed) recs = getRenders(id);
  return recs.map((r) => {
    const live = active.get(key(id, r.id));
    return live ? { ...r, progress: live.progress, phase: live.phase } : r;
  });
}

export function getRenderStatus(id: string, rid: string): RenderRecord {
  const rec = listRenders(id).find((r) => r.id === rid);
  if (!rec) throw new HttpError(404, `Render "${rid}" not found.`);
  return rec;
}
