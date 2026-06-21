import { z } from 'zod';
import { Scene, VisualType } from '../schema';
import type { ScriptInput } from './types';

const LANG_LABEL: Record<string, string> = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  bilingual: 'a natural mix of Hindi and English (Hinglish)'
};

// The strict JSON shape we ask every provider to return.
export const LlmScene = z.object({
  spokenLine: z.string().default(''),
  durationSec: z.coerce.number().optional(),
  visualType: z.string().optional(),
  searchKeywords: z.array(z.string()).default([]),
  visualDescription: z.string().default(''),
  imagePrompt: z.string().default('')
});

export const LlmOutput = z.object({
  voiceoverScript: z.string().default(''),
  scenes: z.array(LlmScene).default([])
});

// Fallback creative brief when no template/prompt is supplied.
const DEFAULT_BRIEF =
  'A high-retention, factually accurate short on the topic. Open with a strong ' +
  '3-second hook, keep the curiosity gap alive throughout, and end on the most ' +
  'interesting fact plus a discussion-worthy question.';

/**
 * MASTER PROMPT.
 *
 * The system message owns the OUTPUT CONTRACT — the exact JSON structure for the
 * audio script + visual timeline, plus universal segmentation/visual rules.
 * Prompt templates are CREATIVE BRIEFS that extend this master prompt: they
 * govern tone, language, length and hook strategy, but never the output shape.
 */
export function buildMessages(input: ScriptInput) {
  const lang = LANG_LABEL[input.language] || 'English';

  const system = `You are an elite short-form video scriptwriter and director for a faceless facts channel. From a CREATIVE BRIEF and a TOPIC you produce two things together: (1) a spoken VOICEOVER SCRIPT and (2) a matching VISUAL TIMELINE.

You ALWAYS respond with a SINGLE valid JSON object and NOTHING else — no markdown, no code fences, no commentary.

OUTPUT JSON — use exactly this shape:
{
  "voiceoverScript": "the complete narration as one flowing string",
  "scenes": [
    {
      "spokenLine": "the exact words narrated during this scene",
      "durationSec": 3,
      "visualType": "Video" | "Image" | "Animation" | "SplitScreen",
      "searchKeywords": ["3-5 short, highly searchable visual terms"],
      "visualDescription": "one concise line describing what appears on screen",
      "imagePrompt": "a detailed AI image-generation prompt; ultra-realistic, cinematic, 9:16 vertical"
    }
  ]
}

UNIVERSAL RULES (always apply):
- Break the FULL narration into consecutive scenes of 3-4 seconds each (durationSec between 2 and 4). Every spoken word belongs to exactly one scene, in order.
- "voiceoverScript" MUST be exactly the concatenation of all "spokenLine" values, in order.
- Visuals change every scene, stay highly dynamic, and directly support the narration. Prefer visuals easy to source (stock sites, documentaries, news footage, public domain) or generate. Avoid generic visuals.
- Vary "visualType"; use close-ups, maps, satellite imagery, scientific visuals, motion graphics, historical/news footage, nature footage, and dramatic zooms where relevant.
- "searchKeywords" must be concrete and visual. Stay factually accurate.
- If the brief does not specify a length, target roughly ${Math.max(24, input.sceneCount * 3)}-45 seconds.

LANGUAGE: if the CREATIVE BRIEF specifies a language, write "spokenLine"/"voiceoverScript" in that language; otherwise write in ${lang}. Always use that language's native script — for Hindi, write in Devanagari (e.g. "क्या आपको पता है") and never transliterate into Latin/English letters. Common English loanwords may stay in English.

Respond with ONLY the JSON object.`;

  const user = `CREATIVE BRIEF:
${input.prompt?.trim() || DEFAULT_BRIEF}

TOPIC: ${input.topic}

Produce the JSON now.`;

  return { system, user };
}

// Parse a model's text response into validated scenes with sequential timings.
export function parseScript(text: string): { voiceoverScript: string; scenes: Scene[] } {
  const json = extractJson(text);
  const out = LlmOutput.parse(json);

  let t = 0;
  const scenes: Scene[] = out.scenes.map((s, i) => {
    const dur = Number.isFinite(s.durationSec) && s.durationSec! > 0 ? s.durationSec! : 3;
    const start = Math.round(t * 100) / 100;
    const end = Math.round((t + dur) * 100) / 100;
    t = end;
    return Scene.parse({
      scene: i + 1,
      start,
      end,
      spokenLine: s.spokenLine,
      visualType: normalizeVisualType(s.visualType),
      searchKeywords: s.searchKeywords,
      visualDescription: s.visualDescription,
      imagePrompt: s.imagePrompt
    });
  });

  const voiceoverScript =
    out.voiceoverScript.trim() || scenes.map((s) => s.spokenLine).join(' ').trim();

  if (scenes.length === 0) throw new Error('Model returned no scenes.');
  return { voiceoverScript, scenes };
}

function normalizeVisualType(v?: string): z.infer<typeof VisualType> {
  const s = String(v || '').toLowerCase();
  if (s.startsWith('vid')) return 'Video';
  if (s.startsWith('split')) return 'SplitScreen';
  if (s.startsWith('anim')) return 'Animation';
  return 'Image';
}

// Models sometimes wrap JSON in prose or ```json fences — pull out the object.
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* fall through */
    }
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }
  throw new Error('Could not parse JSON from model response.');
}
