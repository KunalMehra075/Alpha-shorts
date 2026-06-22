import { defaultScriptGenerator } from './llm';
import {
  HttpError,
  addScene,
  ensureSceneRows,
  getAssetsState,
  getCaptions,
  getCurrentScript,
  getScenes,
  readManifest,
  setScenes
} from './store';
import { getLibrary } from './store';
import { getMediaLibrary } from './media';
import { selectSceneFromGlobal, selectSceneFromLibrary, setSceneTrim } from './assets';

const generator = defaultScriptGenerator();

// Add a new manual scene built from a chosen library/global asset, attach it,
// and (for video) apply the trim window. Returns the fresh scenes + assets.
export async function addSceneFromMedia(opts: {
  id: string;
  source: 'library' | 'global';
  itemId: string;
  durationSec?: number;
  trimStartSec?: number;
  trimEndSec?: number;
}) {
  const { id, source, itemId } = opts;
  const item =
    source === 'global'
      ? getMediaLibrary().find((i) => i.id === itemId)
      : getLibrary(id).find((i) => i.id === itemId);
  if (!item) throw new HttpError(404, `Media "${itemId}" not found.`);
  if (item.kind === 'audio') {
    throw new HttpError(400, 'Audio files can’t be a scene visual — use them as background music.');
  }

  const isVideo = item.kind === 'video';
  // Image → fixed duration (default 3s). Video → the trim window (default whole clip ≤ 60s).
  const durationSec = isVideo
    ? Math.max(0.5, (opts.trimEndSec ?? 0) - (opts.trimStartSec ?? 0) || 3)
    : Math.max(0.5, opts.durationSec ?? 3);

  addScene(id, { visualType: isVideo ? 'Video' : 'Image', durationSec });
  const sceneNumber = getScenes(id).length; // appended last

  if (source === 'global') await selectSceneFromGlobal({ id, sceneNumber, itemId });
  else await selectSceneFromLibrary({ id, sceneNumber, itemId });

  if (isVideo) {
    const start = Math.max(0, opts.trimStartSec ?? 0);
    const srcDur: number = 'durationSec' in item ? Number(item.durationSec) || 0 : 0;
    const end = opts.trimEndSec ?? start + Math.min(60, srcDur || durationSec || 60);
    await setSceneTrim({ id, sceneNumber, trimStartSec: start, trimEndSec: end });
  }

  return { scenes: getScenes(id), assets: getAssetsState(id) };
}

/**
 * Build the scene-by-scene breakdown from whatever narration source is available:
 * the Script Generator's text if present, else the caption transcript (its lines
 * joined back into a script). One "director" LLM pass turns that text into an
 * editable `manifest.scenes`. We never use caption *timings* — only the words.
 */
export async function buildBreakdown(id: string) {
  const m = readManifest(id);

  const script = getCurrentScript(id)?.voiceoverScript?.trim() || '';
  const transcript = getCaptions(id)
    .lines.map((l) => l.text)
    .join(' ')
    .trim();
  const text = script || transcript;

  if (!text) {
    throw new HttpError(
      400,
      'Nothing to break down yet. Generate a script (step 1), or add audio and generate captions first.'
    );
  }

  const words = text.split(/\s+/).filter(Boolean).length;
  const sceneCount = Math.min(20, Math.max(3, Math.round(words / 12)));

  const result = await generator.runBreakdown({ script: text, language: m.language, sceneCount });

  setScenes(id, result.scenes);
  ensureSceneRows(id); // align asset rows to the new scene set

  return {
    scenes: getScenes(id),
    provider: result.provider,
    mock: result.mock,
    source: script ? 'script' : 'transcript'
  };
}
