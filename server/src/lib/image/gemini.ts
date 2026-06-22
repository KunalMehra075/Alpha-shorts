import { IMAGE_TIMEOUT_MS, type ImageRequest, type ImageResult, type ImageStrategy } from './types';

// Google Gemini image generation (e.g. "Nano Banana" / gemini-2.5-flash-image).
// Returns the image as inline base64 data on the generateContent response.
export class GeminiImageStrategy implements ImageStrategy {
  readonly name = 'gemini';

  private apiKey() {
    return process.env.GEMINI_API_KEY;
  }
  private model() {
    return process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  }

  isAvailable() {
    return !!this.apiKey();
  }

  async generate(req: ImageRequest): Promise<ImageResult> {
    const key = this.apiKey();
    if (!key) throw new Error(`${this.name}: GEMINI_API_KEY not configured`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model()}:generateContent?key=${key}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: req.prompt }] }],
          generationConfig: { imageConfig: { aspectRatio: req.aspect } }
        })
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
    const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p?.inlineData?.data);
    if (!imgPart) {
      const text = parts.find((p) => p?.text)?.text;
      throw new Error(`${this.name}: no image in response${text ? ` (model said: ${text.slice(0, 200)})` : ''}`);
    }
    return {
      buffer: Buffer.from(imgPart.inlineData.data, 'base64'),
      mime: imgPart.inlineData.mimeType || 'image/png',
      provider: this.name
    };
  }
}
