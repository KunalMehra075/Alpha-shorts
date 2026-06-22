import {
  IMAGE_TIMEOUT_MS,
  type ImageAspect,
  type ImageRequest,
  type ImageResult,
  type ImageStrategy
} from './types';

// OpenAI image generation (gpt-image-1 by default; set OPENAI_IMAGE_MODEL=dall-e-3
// to fall back to DALL·E 3). Returns base64 PNG.
export class OpenAIImageStrategy implements ImageStrategy {
  readonly name = 'openai';

  private apiKey() {
    return process.env.OPENAI_API_KEY;
  }
  private baseUrl() {
    return process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  }
  private model() {
    return process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  }

  isAvailable() {
    return !!this.apiKey();
  }

  // gpt-image-1 portrait/landscape/square sizes. DALL·E 3 uses 1024x1792 for
  // portrait and 1792x1024 for landscape.
  private size(aspect: ImageAspect): string {
    const dalle = /dall-e/i.test(this.model());
    if (aspect === '16:9') return dalle ? '1792x1024' : '1536x1024';
    if (aspect === '1:1') return '1024x1024';
    return dalle ? '1024x1792' : '1024x1536'; // 9:16
  }

  async generate(req: ImageRequest): Promise<ImageResult> {
    const key = this.apiKey();
    if (!key) throw new Error(`${this.name}: OPENAI_API_KEY not configured`);

    const body: Record<string, unknown> = {
      model: this.model(),
      prompt: req.prompt,
      n: 1,
      size: this.size(req.aspect)
    };
    // DALL·E 3 needs an explicit response_format; gpt-image-1 always returns b64.
    if (/dall-e/i.test(this.model())) body.response_format = 'b64_json';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl()}/images/generations`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify(body)
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let detail = '';
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
      throw new Error(
        `${this.name} HTTP ${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 300)}` : ''}`
      );
    }

    const data: any = await res.json();
    const b64: string | undefined = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error(`${this.name}: no image data in response`);
    return { buffer: Buffer.from(b64, 'base64'), mime: 'image/png', provider: this.name };
  }
}
