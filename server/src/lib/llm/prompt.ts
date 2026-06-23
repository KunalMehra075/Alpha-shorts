import { z } from 'zod';
import { Scene, VisualType } from '../schema';
import type { BreakdownInput, CaptionFixInput, ScriptInput, SeoInput } from './types';

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
  'A high-retention, 100% factual short built around ONE central mystery or question. ' +
  'Open with a 3-second curiosity-gap hook, build evidence, escalate, hit a "wait... what?" twist, ' +
  'then resolve with the most interesting fact in the final 5 seconds and end on a ' +
  'discussion-worthy question.';

/**
 * WRITER PROMPT — produces ONLY the narration (voiceover) text. The visual
 * breakdown is a separate "director" pass (see below), so the Script step stays
 * independent of the Assets/timeline step.
 *
 * The system prompt embeds the channel's mystery-driven retention philosophy
 * (see docs/prompts) while keeping our strict JSON contract — the creative
 * BRIEF/template still owns language, length, and tone specifics.
 */
export function buildWriterMessages(input: ScriptInput) {
  const lang = LANG_LABEL[input.language] || 'English';

  const system = `You are an elite short-form video scriptwriter for a faceless facts/mystery channel (science, history, geography, space, technology, psychology, archaeology, nature, and factually-backed mysteries). From a CREATIVE BRIEF and a TOPIC you write a single spoken VOICEOVER SCRIPT engineered for maximum retention, watch time, rewatchability, shares, and comments — while staying 100% factually accurate.

You ALWAYS respond with a SINGLE valid JSON object and NOTHING else — no markdown, no code fences, no commentary.

OUTPUT JSON — use exactly this shape:
{
  "voiceoverScript": "the complete narration as one flowing string"
}

CORE PHILOSOPHY — mystery-driven, NOT a list of facts:
- Build the whole script around ONE central mystery, question, investigation, claim, prediction, or discovery, and constantly move toward resolving it.
- The viewer must feel that leaving early means missing the answer. Every sentence must increase curiosity, add evidence, escalate the mystery, or deliver a reveal — no filler.

STRUCTURE (follow this arc):
1. Hook / Mystery — the first 3 seconds open a powerful curiosity gap (a shocking question, claim, or impossible-sounding fact).
2. Evidence / Setup — introduce the first facts; make the mystery feel real and credible.
3. Escalation — stronger evidence; raise the stakes.
4. Twist — a contradiction or surprising discovery; create at least one "wait... what?" moment around the middle.
5. Resolution / Verdict — resolve the mystery and deliver the single most interesting fact of the whole script in the final ~5 seconds.
6. Discussion question — end on a question that sparks comments and debate.

RETENTION RULES:
- Every ~10-15 seconds, introduce a new surprising piece of information (a number, discovery, contradiction, or consequence) to reset attention.
- Use OPEN LOOPS that tease what's coming (e.g. "but the real mystery is still ahead...", "and this is where it gets strange...").
- Include at least one ABSURDITY-FACTOR fact: unbelievable but true (extreme scale, age, distance, rarity, or consequence) that makes the viewer think "how is this even possible?".
- Include at least one highly SHAREABLE fact people would want to tell a friend.

RELATABILITY: wherever possible, connect the topic to human survival, daily life, the future, Earth, money, technology, ancient civilizations, or human curiosity, so the viewer instantly understands why it matters.

FACTUAL GUARD: stay strictly accurate. Do NOT invent statistics, dates, or names. If a precise number can't be stated confidently, describe the scale qualitatively instead of fabricating it. No pseudoscience, conspiracy theories, or clickbait the script cannot pay off — the resolution must genuinely deliver on the hook.

NARRATION CRAFT:
- Short, spoken sentences with natural pauses (commas, ellipses ...). Fast, dense, high-energy. Optimized to be read aloud by an ElevenLabs AI voice.
- Every sentence should naturally create a strong visual.
- Narration WORDS ONLY — no on-screen directions, no scene labels, no headings.

LENGTH: if the CREATIVE BRIEF specifies a length, follow it; otherwise target about 70-80 seconds (~110-130 words).

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
      "spokenLine": "the exact words narrated during this scene (original language, verbatim)",
      "durationSec": 3,
      "visualType": "Image" | "Video",
      "searchKeywords": ["2-5 short ENGLISH stock-search terms"],
      "visualDescription": "one concise English line describing what appears on screen",
      "imagePrompt": "a detailed, scene-specific AI image prompt in ENGLISH (see rules)"
    }
  ]
}

CRITICAL RULES:
- Use the PROVIDED script VERBATIM for "spokenLine". Split it into consecutive scenes; concatenating all "spokenLine" values in order MUST reproduce the original script exactly. Do NOT rewrite, translate, paraphrase, add, or drop any words. Keep the original language and script (e.g. Devanagari stays Devanagari). Only "spokenLine" keeps the original language — everything else is ENGLISH.
- Break it into scenes of ~3-4 seconds each (durationSec between 2 and 4); aim for about ${input.sceneCount} scenes total. Every word belongs to exactly one scene, in order.
- "visualType" MUST be either "Image" or "Video" only — never Animation or SplitScreen. Use "Video" for motion, action, process, or atmosphere lines; use "Image" for a single strong subject, place, object, map, or portrait.
- "searchKeywords" MUST ALWAYS be in ENGLISH, even when the narration is Hindi or another language — they are used to search stock libraries (Pexels/Pixabay) which are English-indexed. Translate the MEANING of the line into 2-5 concrete, visual English terms (e.g. "underwater ancient ruins", "submerged city", "sonar scan", "Dwarka temple"). No abstract or non-visual words; no transliteration.
- "visualDescription": one short ENGLISH line describing the exact shot on screen.
- "imagePrompt": a DETAILED, scene-specific image-generation prompt in ENGLISH that depicts exactly what THIS line is about. Name the subject, setting, key details, camera angle/composition, lighting, mood, and art style, then end with ", 9:16 vertical, ultra-realistic, cinematic". It must be specific to this scene — never a generic template.
- Prefer specific, retention-friendly visuals that match the line: maps, satellite imagery, historical reconstructions, real footage, news footage, archaeological finds, space visuals, dramatic close-ups. Avoid generic stock.

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

export const CaptionFixOutput = z.object({ lines: z.array(z.string()).default([]) });

/**
 * CAPTION FIX PROMPT — corrects misspelled auto-transcribed caption lines.
 * Two modes:
 *  - with a ground-truth SCRIPT (Option B fallback): use it as the source of truth.
 *  - without a script: fix spelling/punctuation purely from the captions' context.
 * Both preserve line count/order so existing per-line timings still apply, and are
 * constrained to word/punctuation fixes only (no add/remove/reorder/rephrase).
 */
export function buildCaptionFixMessages(input: CaptionFixInput) {
  const hasScript = input.script.trim().length > 0;

  const common = `You ALWAYS respond with a SINGLE valid JSON object and NOTHING else — no markdown, no commentary.

OUTPUT JSON — exactly this shape:
{ "lines": ["corrected text for line 1", "corrected text for line 2", ...] }

HARD CONSTRAINTS (never violate):
- Return EXACTLY ${input.lines.length} lines, in the same order — one corrected string per input line.
- Fix ONLY spelling and punctuation of the words that are already present.
- Do NOT add, remove, reorder, merge, split, rephrase, or translate words. Keep each line's words and their order; only correct how they are spelled/punctuated.
- Preserve the original writing system (e.g. Devanagari stays Devanagari) and natural casing.
- If a line is already correct, return it unchanged.`;

  if (hasScript) {
    const system = `You correct auto-transcribed video captions using the EXACT narration SCRIPT as the source of truth for spelling.\n\n${common}`;
    const user = `SCRIPT (ground truth):
${input.script.trim()}

CAPTION LINES (${input.lines.length}) to correct, in order:
${JSON.stringify(input.lines)}

Return the JSON now.`;
    return { system, user };
  }

  const system = `You correct the spelling and punctuation of auto-transcribed video captions. There is NO reference script — infer each intended word from the surrounding context of the captions themselves, then fix only obvious transcription spelling/punctuation errors.\n\n${common}`;
  const user = `CAPTION LINES (${input.lines.length}) to correct, in order:
${JSON.stringify(input.lines)}

Return the JSON now.`;
  return { system, user };
}

export function parseCaptionFix(text: string): string[] {
  const out = CaptionFixOutput.parse(extractJson(text));
  return out.lines.map((s) => (s ?? '').toString());
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

// AI scenes are restricted to Image or Video — Animation/SplitScreen are clamped
// to Image so the breakdown never produces a type we no longer use.
function normalizeVisualType(v?: string): z.infer<typeof VisualType> {
  const s = String(v || '').toLowerCase();
  if (s.startsWith('vid')) return 'Video';
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
