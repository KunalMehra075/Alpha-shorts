import { defaultScriptGenerator } from './llm';
import { getCaptions, getCurrentScript, readManifest } from './store';

const generator = defaultScriptGenerator();

// Generate SEO metadata (titles/descriptions/tags) from the workspace's topic +
// narration (script if present, else the caption transcript). Reuses the LLM
// strategy chain (DeepSeek → OpenAI → mock).
export async function generateSeo(id: string) {
  const m = readManifest(id);
  const script = getCurrentScript(id);
  const transcript = getCaptions(id)
    .lines.map((l) => l.text)
    .join(' ')
    .trim();
  const topic = script?.topic?.trim() || m.name || 'this video';
  const text = script?.voiceoverScript?.trim() || transcript || topic;

  const result = await generator.runSeo({ topic, script: text, language: m.language });
  return result; // { titles, descriptions, tags, provider, mock, attempts }
}
