import { GeminiImageStrategy } from './gemini';
import { OpenAIImageStrategy } from './openai';
import type { ImageRequest, ImageResult, ImageStrategy } from './types';

export type { ImageAspect, ImageRequest, ImageResult, ImageStrategy } from './types';

// Context for the image-generation strategy chain. Runs the first available
// strategy and falls back to the next on failure — order = cheapest→costly.
// Mirrors ScriptGenerator in ../llm/index.ts.
export class ImageGenerator {
  constructor(private readonly strategies: ImageStrategy[]) {}

  available(): string[] {
    return this.strategies.filter((s) => s.isAvailable()).map((s) => s.name);
  }

  async generate(req: ImageRequest): Promise<ImageResult & { attempts: string[] }> {
    const attempts: string[] = [];
    for (const strategy of this.strategies) {
      if (!strategy.isAvailable()) continue;
      try {
        const result = await strategy.generate(req);
        return { ...result, attempts };
      } catch (err: any) {
        const msg = `${strategy.name}: ${err?.message ?? err}`;
        attempts.push(msg);
        console.warn(`[image] ${msg} — falling back`);
      }
    }
    if (attempts.length === 0) {
      throw new Error(
        'No image provider is configured. Add GEMINI_API_KEY or OPENAI_API_KEY to the project .env, then restart.'
      );
    }
    throw new Error(`All image strategies failed: ${attempts.join(' | ')}`);
  }
}

// Default priority chain: Gemini (cheapest) first, OpenAI as fallback.
export function defaultImageGenerator(): ImageGenerator {
  return new ImageGenerator([new GeminiImageStrategy(), new OpenAIImageStrategy()]);
}

// For UI gating / status endpoint.
export function imageGenAvailable(): { available: boolean; providers: string[] } {
  const providers = defaultImageGenerator().available();
  return { available: providers.length > 0, providers };
}
