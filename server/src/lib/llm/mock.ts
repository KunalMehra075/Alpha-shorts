import { generateMockScript } from '../mock';
import type { ScriptInput, ScriptResult, ScriptStrategy } from './types';

// Always-available safety net so script generation never hard-fails (e.g. no API
// keys, or every provider is down). Flagged as provider "mock" in the result.
export class MockStrategy implements ScriptStrategy {
  readonly name = 'mock';
  isAvailable() {
    return true;
  }
  async generate(input: ScriptInput): Promise<ScriptResult> {
    const { voiceoverScript, scenes } = generateMockScript(input.topic, input.sceneCount);
    return { voiceoverScript, scenes, provider: 'mock' };
  }
}
