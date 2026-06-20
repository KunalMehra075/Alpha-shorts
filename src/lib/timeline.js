import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync
} from 'node:fs';
import { join, extname, isAbsolute, basename } from 'node:path';
import { paths } from './paths.js';
import { searchAssets } from './assets.js';
import { downloadAsset } from './asset-cache.js';
import { CliError } from './cli.js';

// Motion effects available per scene type. Picked with variety (no immediate
// repeat) so consecutive scenes don't reuse the same movement.
const IMAGE_EFFECTS = ['kenburns-in', 'kenburns-out', 'pan-left', 'pan-right', 'parallax'];
const VIDEO_EFFECTS = ['zoom-in', 'zoom-out', 'drift'];
const ANIMATION_KINDS = ['particles', 'glow', 'question', 'science', 'wisdom', 'generic'];
const SPLIT_VARIANTS = ['leftright', 'ancient-modern', 'before-after'];

// Deterministic small hash so renders are reproducible for the same script.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff; // 0..1
}

// Pick from a pool by index with a per-script jitter, avoiding `avoid`.
function pickVaried(pool, index, salt, avoid) {
  const start = Math.floor(hash(`${salt}:${index}`) * pool.length);
  for (let i = 0; i < pool.length; i++) {
    const choice = pool[(start + i) % pool.length];
    if (choice !== avoid) return choice;
  }
  return pool[start % pool.length];
}

// Infer an animation flavor from the scene's keywords / spoken line.
function inferAnimationKind(keywords, spokenLine, index, salt) {
  const text = `${(keywords || []).join(' ')} ${spokenLine || ''}`.toLowerCase();
  if (/\?|question|mystery|why|how|what if/.test(text)) return 'question';
  if (/scien|brain|neuron|atom|space|galaxy|dna|physics|chemi|tech/.test(text))
    return 'science';
  if (/ancient|wisdom|temple|veda|spiritual|sage|myth|sacred|dharma|god/.test(text))
    return 'wisdom';
  return pickVaried(['particles', 'glow', 'generic'], index, `${salt}:anim`);
}

function normalizeVisualType(t) {
  const v = String(t || 'image').toLowerCase().replace(/[^a-z]/g, '');
  if (v.startsWith('vid')) return 'video';
  if (v.startsWith('split')) return 'splitscreen';
  if (v.startsWith('anim')) return 'animation';
  return 'image';
}

// Parse + validate the scene script (a JSON array, or { scenes: [...] }).
export function readScript(scriptPath) {
  const resolved = isAbsolute(scriptPath)
    ? scriptPath
    : existsSync(scriptPath)
      ? scriptPath
      : join(paths.scenes, scriptPath.endsWith('.json') ? scriptPath : `${scriptPath}.json`);

  if (!existsSync(resolved)) {
    throw new CliError(
      `Could not find scene script "${scriptPath}".\n` +
        `Looked at: ${resolved}\n` +
        `Pass a path, or drop a .json file in ${paths.scenes}.`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (err) {
    throw new CliError(`Scene script "${resolved}" is not valid JSON: ${err.message}`);
  }

  const scenes = Array.isArray(parsed) ? parsed : parsed.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new CliError(
      `Scene script "${resolved}" must be a non-empty JSON array of scenes ` +
        `(or an object with a "scenes" array).`
    );
  }

  scenes.forEach((s, i) => {
    if (typeof s.start !== 'number' || typeof s.end !== 'number' || s.end <= s.start) {
      throw new CliError(
        `Scene #${i} has invalid start/end (${s.start} -> ${s.end}). ` +
          `Both must be numbers with end > start (seconds).`
      );
    }
  });

  return { scenes, path: resolved, name: basename(resolved, '.json') };
}

// Clear and recreate remotion/public/assets so each render only serves its own
// staged files. Returns the absolute assets dir.
function freshStagingDir() {
  const dir = join(paths.remotionPublic, 'assets');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Copy a local file into the staging dir and return its staticFile-relative path.
function stage(srcPath, stageDir, stageName) {
  const ext = extname(srcPath) || '';
  const dest = join(stageDir, `${stageName}${ext}`);
  copyFileSync(srcPath, dest);
  return `assets/${stageName}${ext}`; // forward slashes for staticFile()
}

// Resolve a candidate to a local file (download if remote), then stage it.
async function materialize(candidate, { stageDir, stageName, config, logger }) {
  let localPath = candidate.libraryPath;
  if (!localPath && candidate.downloadUrl) {
    const { path, cached } = await downloadAsset({
      url: candidate.downloadUrl,
      kind: candidate.type,
      config,
      logger
    });
    localPath = path;
    logger?.debug(`${cached ? 'reused' : 'fetched'} ${candidate.source} ${candidate.type}`);
  }
  if (!localPath || !existsSync(localPath)) return null;
  return {
    type: candidate.type,
    src: stage(localPath, stageDir, stageName),
    source: candidate.source,
    width: candidate.width,
    height: candidate.height
  };
}

/**
 * Build the full timeline (inputProps for the Remotion composition) from a scene
 * script: resolves + downloads + stages assets, assigns motion/transitions, and
 * computes frame timings. Never throws on a missing asset — falls back to a
 * procedural animation scene so rendering always succeeds.
 *
 * @returns {Promise<object>} inputProps for <Composition>.
 */
export async function buildTimeline({ script, config, narrationPath, musicPath, logger }) {
  const { render, transitions } = config;
  const fps = render.fps;
  const stageDir = freshStagingDir();
  const salt = script.name;

  const scenes = [];
  let prevEffect = null;
  let prevTransition = null;
  let lastEndFrame = 0;

  for (let i = 0; i < script.scenes.length; i++) {
    const raw = script.scenes[i];
    const visualType = normalizeVisualType(raw.visualType);
    const from = Math.max(0, Math.round(raw.start * fps));
    const durationInFrames = Math.max(1, Math.round((raw.end - raw.start) * fps));
    const keywords = Array.isArray(raw.searchKeywords) ? raw.searchKeywords : [];

    const transitionIn = pickVaried(
      transitions.types,
      i,
      `${salt}:trans`,
      i === 0 ? null : prevTransition
    );
    prevTransition = transitionIn;

    const scene = {
      index: i,
      visualType,
      from,
      durationInFrames,
      spokenLine: raw.spokenLine || '',
      keywords,
      transitionIn,
      assets: [],
      effect: null,
      animationKind: null
    };

    if (visualType === 'animation') {
      scene.animationKind = inferAnimationKind(keywords, raw.spokenLine, i, salt);
    } else {
      const ranked = keywords.length
        ? await searchAssets({ keywords, config, logger })
        : [];

      if (visualType === 'splitscreen') {
        const picks = pickSplit(ranked);
        const staged = [];
        for (let n = 0; n < picks.length; n++) {
          const m = await materialize(picks[n], {
            stageDir,
            stageName: `scene-${i}-${n}`,
            config,
            logger
          });
          if (m) staged.push(m);
        }
        if (staged.length >= 2) {
          scene.assets = staged.slice(0, 2);
          scene.splitVariant = pickVaried(SPLIT_VARIANTS, i, `${salt}:split`);
        } else {
          fallbackToAnimation(scene, keywords, raw.spokenLine, i, salt, logger);
        }
      } else {
        // image / video scenes
        const wantVideo = visualType === 'video';
        const pick =
          (wantVideo
            ? ranked.find((c) => c.type === 'video')
            : ranked.find((c) => c.type === 'image')) ||
          ranked[0]; // fall back to any best-scored asset

        const m = pick
          ? await materialize(pick, { stageDir, stageName: `scene-${i}-0`, config, logger })
          : null;

        if (m) {
          scene.assets = [m];
          scene.visualType = m.type; // render as whatever we actually got
          const pool = m.type === 'video' ? VIDEO_EFFECTS : IMAGE_EFFECTS;
          scene.effect = pickVaried(pool, i, `${salt}:fx`, prevEffect);
          prevEffect = scene.effect;
        } else {
          fallbackToAnimation(scene, keywords, raw.spokenLine, i, salt, logger);
        }
      }
    }

    lastEndFrame = Math.max(lastEndFrame, from + durationInFrames);
    scenes.push(scene);
  }

  // Stage narration + music so Remotion (headless Chrome) can load them.
  const narration = narrationPath
    ? stage(narrationPath, stageDir, 'narration')
    : null;
  const music = musicPath ? stage(musicPath, stageDir, 'music') : null;

  return {
    width: render.width,
    height: render.height,
    fps,
    durationInFrames: lastEndFrame,
    transitionFrames: Math.max(1, Math.round((transitions.durationMs / 1000) * fps)),
    narration,
    music: music ? { src: music, volume: config.music.volume } : null,
    scenes
  };
}

// Pick up to two distinct candidates for a split-screen comparison, preferring
// images (more stable side-by-side) but accepting video.
function pickSplit(ranked) {
  const images = ranked.filter((c) => c.type === 'image');
  const pool = images.length >= 2 ? images : ranked;
  const picks = [];
  const seen = new Set();
  for (const c of pool) {
    const key = c.downloadUrl || c.libraryPath;
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(c);
    if (picks.length === 2) break;
  }
  return picks;
}

function fallbackToAnimation(scene, keywords, spokenLine, i, salt, logger) {
  scene.visualType = 'animation';
  scene.assets = [];
  scene.animationKind = inferAnimationKind(keywords, spokenLine, i, salt);
  logger?.warn(
    `Scene #${i}: no usable asset found — using "${scene.animationKind}" animation fallback.`
  );
}
