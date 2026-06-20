import { DeepseekStrategy } from './deepseek';
import { OpenAIStrategy } from './openai';
import { MockStrategy } from './mock';
import type { ScriptInput, ScriptResult, ScriptStrategy } from './types';

export type { ScriptInput, ScriptResult, ScriptStrategy } from './types';

/**
 * Context for the strategy pattern: holds an ordered list of script-generation
 * strategies and runs the first available one, falling back to the next on
 * failure. Order = priority: DeepSeek → OpenAI → Mock.
 */
export class ScriptGenerator {
  constructor(private readonly strategies: ScriptStrategy[]) {}

  /** Names of strategies that are currently configured (have API keys). */
  available(): string[] {
    return this.strategies.filter((s) => s.isAvailable()).map((s) => s.name);
  }

  async run(input: ScriptInput): Promise<ScriptResult & { mock: boolean; attempts: string[] }> {
    const attempts: string[] = [];
    for (const strategy of this.strategies) {
      if (!strategy.isAvailable()) continue;
      try {
        const result = await strategy.generate(input);
        return { ...result, mock: strategy.name === 'mock', attempts };
      } catch (err: any) {
        const msg = `${strategy.name}: ${err?.message ?? err}`;
        attempts.push(msg);
        console.warn(`[script] ${msg} — falling back`);
      }
    }
    // MockStrategy is always available, so this is effectively unreachable.
    throw new Error(`All script strategies failed: ${attempts.join(' | ')}`);
  }
}

// Default priority chain. DeepSeek gets the first hit.
export function defaultScriptGenerator(): ScriptGenerator {
  return new ScriptGenerator([
    new DeepseekStrategy(),
    new OpenAIStrategy(),
    new MockStrategy()
  ]);
}
