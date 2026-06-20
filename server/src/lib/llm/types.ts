import type { Scene } from '../schema';

export type ScriptInput = {
  topic: string;
  prompt: string; // the user's custom "AI Prompt" (style guidance)
  language: string; // en | hi | bilingual
  sceneCount: number;
};

export type ScriptResult = {
  voiceoverScript: string;
  scenes: Scene[];
  provider: string;
};

/**
 * Strategy interface for a script-generation provider. Each concrete strategy
 * (DeepSeek, OpenAI, Mock) knows whether it's configured (isAvailable) and how
 * to produce a script. The ScriptGenerator context tries them in order.
 */
export interface ScriptStrategy {
  readonly name: string;
  isAvailable(): boolean;
  generate(input: ScriptInput): Promise<ScriptResult>;
}
