import { generateMockBreakdown, generateMockNarration, generateMockSeo } from '../mock';
import type {
  BreakdownInput,
  BreakdownResult,
  CaptionFixInput,
  CaptionFixResult,
  ScriptInput,
  ScriptResult,
  ScriptStrategy,
  SeoInput,
  SeoResult
} from './types';

// Always-available safety net so generation never hard-fails (e.g. no API keys,
// or every provider is down). Flagged as provider "mock" in the result.
export class MockStrategy implements ScriptStrategy {
  readonly name = 'mock';
  isAvailable() {
    return true;
  }
  async generate(input: ScriptInput): Promise<ScriptResult> {
    return { voiceoverScript: generateMockNarration(input.topic, input.sceneCount), provider: 'mock' };
  }
  async breakdown(input: BreakdownInput): Promise<BreakdownResult> {
    return { scenes: generateMockBreakdown(input.script, input.sceneCount), provider: 'mock' };
  }
  async seo(input: SeoInput): Promise<SeoResult> {
    return { ...generateMockSeo(input.topic), provider: 'mock' };
  }
  async fixCaptions(input: CaptionFixInput): Promise<CaptionFixResult> {
    // No real model — return the lines unchanged so the caller falls back to the
    // deterministic alignment (Option A).
    return { lines: input.lines, provider: 'mock' };
  }
}
