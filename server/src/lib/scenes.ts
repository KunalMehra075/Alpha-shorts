import { defaultScriptGenerator } from './llm';
import {
  HttpError,
  ensureSceneRows,
  getCaptions,
  getCurrentScript,
  getScenes,
  readManifest,
  setScenes
} from './store';

const generator = defaultScriptGenerator();

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
