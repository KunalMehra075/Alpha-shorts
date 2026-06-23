import type { Scene } from '../schema';

export type ScriptInput = {
  topic: string;
  prompt: string; // the user's custom "AI Prompt" (style guidance)
  language: string; // en | hi | bilingual
  sceneCount: number;
};

export type ScriptResult = {
  voiceoverScript: string;
  provider: string;
};

// Turning an existing narration (script text or joined transcript) into a
// scene-by-scene visual breakdown. The narration words are preserved verbatim.
export type BreakdownInput = {
  script: string; // full narration text
  language: string;
  sceneCount: number; // target number of scenes (a hint)
};

export type BreakdownResult = {
  scenes: Scene[];
  provider: string;
};

// SEO metadata for the uploader (titles/description/tags) from the topic + script.
export type SeoInput = {
  topic: string;
  script: string;
  language: string;
};

export type SeoResult = {
  titles: string[];
  descriptions: string[];
  tags: string[];
  provider: string;
};

// Correcting auto-transcribed caption lines against the ground-truth script.
export type CaptionFixInput = {
  script: string; // ground-truth narration
  lines: string[]; // current caption line texts, in order
  language: string;
};

export type CaptionFixResult = {
  lines: string[]; // corrected line texts, same count/order
  provider: string;
};

/**
 * Strategy interface for an LLM provider. Each concrete strategy (DeepSeek,
 * OpenAI, Mock) knows whether it's configured (isAvailable), how to WRITE the
 * narration (generate), and how to plan the visual breakdown from narration
 * (breakdown). The ScriptGenerator context tries them in order.
 */
export interface ScriptStrategy {
  readonly name: string;
  isAvailable(): boolean;
  generate(input: ScriptInput): Promise<ScriptResult>;
  breakdown(input: BreakdownInput): Promise<BreakdownResult>;
  seo(input: SeoInput): Promise<SeoResult>;
  fixCaptions(input: CaptionFixInput): Promise<CaptionFixResult>;
}
