import { z } from 'zod';
import { Scene, VisualType } from '../schema';
import type { BreakdownInput, ScriptInput, SeoInput } from './types';

const LANG_LABEL: Record<string, string> = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  bilingual: 'a natural mix of Hindi and English (Hinglish)'
};

// The strict JSON scene shape we ask the director to return.
export const LlmScene = z.object({
  spokenLine: z.string().default(''),
  durationSec: z.coerce.number().optional(),
  visualType: z.string().optional(),
  searchKeywords: z.array(z.string()).default([]),
  visualDescription: z.string().default(''),
  imagePrompt: z.string().default('')
});

export const WriterOutput = z.object({
  voiceoverScript: z.string().default('')
});

export const DirectorOutput = z.object({
  scenes: z.array(LlmScene).default([])
});

// Fallback creative brief when no template/prompt is supplied.
const DEFAULT_BRIEF =
  'A high-retention, factually accurate short on the topic. Open with a strong ' +
  '3-second hook, keep the curiosity gap alive throughout, and end on the most ' +
  'interesting fact plus a discussion-worthy question.';

/**
 * WRITER PROMPT — produces ONLY the narration (voiceover) text. The visual
 * breakdown is a separate "director" pass (see below), so the Script step stays
 * independent of the Assets/timeline step.
 */
export function buildWriterMessages(input: ScriptInput) {
  const lang = LANG_LABEL[input.language] || 'English';

  const system = `You are an elite short-form video scriptwriter for a faceless facts channel. From a CREATIVE BRIEF and a TOPIC you write a single spoken VOICEOVER SCRIPT.

You ALWAYS respond with a SINGLE valid JSON object and NOTHING else — no markdown, no code fences, no commentary.

OUTPUT JSON — use exactly this shape:
{
  "voiceoverScript": "the complete narration as one flowing string"
}

RULES:
- Write the complete narration as natural spoken sentences with natural pauses (commas, ellipses ...).
- If the brief does not specify a length, target roughly ${Math.max(24, input.sceneCount * 3)}-45 seconds (~90-130 words).
- Strong 3-second hook, keep the curiosity gap alive, end on the most interesting fact + a discussion-worthy question.
- Stay 100% factually accurate. No on-screen directions, no scene labels — narration words only.

LANGUAGE: if the CREATIVE BRIEF specifies a language, write in that language; otherwise write in ${lang}. Always use that language's native script — for Hindi, write in Devanagari (e.g. "क्या आपको पता है") and never transliterate into Latin/English letters. Common English loanwords may stay in English.

Respond with ONLY the JSON object.`;

  const user = `CREATIVE BRIEF:
${input.prompt?.trim() || DEFAULT_BRIEF}

TOPIC: ${input.topic}

Produce the JSON now.`;

  return { system, user };
}

/**
 * DIRECTOR PROMPT — turns an EXISTING narration into a visual timeline. It must
 * segment the given words VERBATIM (never rewrite/translate), so it works for
 * AI scripts, hand-written scripts, and transcripts of uploaded audio alike.
 */
export function buildDirectorMessages(input: BreakdownInput) {
  const system = `You are an elite short-form video DIRECTOR for a faceless facts channel. You are given a finished VOICEOVER SCRIPT and you plan a matching VISUAL TIMELINE.

You ALWAYS respond with a SINGLE valid JSON object and NOTHING else — no markdown, no code fences, no commentary.

OUTPUT JSON — use exactly this shape:
{
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

CRITICAL RULES:
- Use the PROVIDED script VERBATIM. Split it into consecutive scenes; concatenating all "spokenLine" values in order MUST reproduce the original script exactly. Do NOT rewrite, translate, paraphrase, add, or drop any words. Keep the original language and script (e.g. Devanagari stays Devanagari).
- Break it into scenes of ~3-4 seconds each (durationSec between 2 and 4); aim for about ${input.sceneCount} scenes total. Every word belongs to exactly one scene, in order.
- Visuals change every scene and directly support that line. Vary "visualType"; prefer easy-to-source visuals. "searchKeywords" must be concrete, visual, and accurate.

Respond with ONLY the JSON object.`;

  const user = `VOICEOVER SCRIPT:
${input.script.trim()}

Produce the JSON timeline now.`;

  return { system, user };
}

const LANG_LABEL2: Record<string, string> = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  bilingual: 'a natural mix of Hindi and English (Hinglish)'
};

export const SeoOutput = z.object({
  titles: z.array(z.string()).default([]),
  descriptions: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([])
});

/** SEO PROMPT — YouTube Shorts metadata from the topic + narration. */
export function buildSeoMessages(input: SeoInput) {
  const lang = LANG_LABEL2[input.language] || 'English';
  const system = `You are a YouTube Shorts SEO expert. From a TOPIC and the video's SCRIPT you produce high-CTR metadata.

You ALWAYS respond with a SINGLE valid JSON object and NOTHING else — no markdown, no commentary.

OUTPUT JSON — exactly this shape:
{
  "titles": ["3 punchy, curiosity-driven titles, each <= 80 chars, may use 1 emoji"],
  "descriptions": ["2 descriptions (2-4 sentences each) ending with relevant #hashtags incl. #shorts"],
  "tags": ["10-15 short, lowercase, highly-searchable tags"]
}

RULES:
- Write titles/descriptions in ${lang} (match the script's language). Tags can be a mix incl. English.
- Accurate to the script; punchy; optimized for retention and search. Always include "shorts" in tags.

Respond with ONLY the JSON object.`;
  const user = `TOPIC: ${input.topic}\n\nSCRIPT:\n${input.script.trim().slice(0, 1500)}\n\nProduce the JSON now.`;
  return { system, user };
}

export function parseSeo(text: string): { titles: string[]; descriptions: string[]; tags: string[] } {
  const out = SeoOutput.parse(extractJson(text));
  const clean = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);
  return {
    titles: clean(out.titles).slice(0, 5),
    descriptions: clean(out.descriptions).slice(0, 3),
    tags: clean(out.tags).slice(0, 15)
  };
}

// Parse a writer response into the narration string.
export function parseNarration(text: string): { voiceoverScript: string } {
  const out = WriterOutput.parse(extractJson(text));
  const voiceoverScript = out.voiceoverScript.trim();
  if (!voiceoverScript) throw new Error('Model returned an empty script.');
  return { voiceoverScript };
}

// Parse a director response into validated scenes with sequential timings.
export function parseBreakdown(text: string): { scenes: Scene[] } {
  const out = DirectorOutput.parse(extractJson(text));

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

  if (scenes.length === 0) throw new Error('Model returned no scenes.');
  return { scenes };
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
