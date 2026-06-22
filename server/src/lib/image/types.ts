export type ImageAspect = '9:16' | '16:9' | '1:1';

export interface ImageRequest {
  prompt: string;
  aspect: ImageAspect;
}

export interface ImageResult {
  buffer: Buffer;
  mime: string; // e.g. 'image/png'
  provider: string; // strategy name
}

// Mirrors ScriptStrategy in ../llm/types.ts — each provider self-reports
// availability from its env key and generates one image per request.
export interface ImageStrategy {
  readonly name: string;
  isAvailable(): boolean;
  generate(req: ImageRequest): Promise<ImageResult>;
}

// Shared 60s timeout for image API calls.
export const IMAGE_TIMEOUT_MS = 60_000;
