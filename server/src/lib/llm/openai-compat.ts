import {
  buildCaptionFixMessages,
  buildDirectorMessages,
  buildSeoMessages,
  buildWriterMessages,
  parseBreakdown,
  parseCaptionFix,
  parseNarration,
  parseSeo
} from './prompt';
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

/**
 * Base strategy for any OpenAI-compatible Chat Completions API (OpenAI, DeepSeek,
 * and most others share the exact same request/response shape). Concrete
 * providers only supply a name, base URL, model and API key.
 */
export abstract class OpenAICompatStrategy implements ScriptStrategy {
  abstract readonly name: string;
  protected abstract readonly baseUrl: string;
  protected abstract model(): string;
  protected abstract apiKey(): string | undefined;

  protected timeoutMs = 60_000;

  isAvailable(): boolean {
    return !!this.apiKey();
  }

  // Shared Chat Completions call returning the raw message content. maxTokens is
  // tunable per call: the breakdown of a long (70-80s) script into many scenes,
  // each with a detailed image prompt, needs far more room than 2000 or the JSON
  // gets truncated and fails to parse (silently falling back to mock).
  protected async chat(system: string, user: string, maxTokens = 2000): Promise<string> {
    const key = this.apiKey();
    if (!key) throw new Error(`${this.name}: API key not configured`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model: this.model(),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          temperature: 0.85,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' }
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
      throw new Error(`${this.name} HTTP ${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }

    const data: any = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) throw new Error(`${this.name}: empty response`);
    return content;
  }

  async generate(input: ScriptInput): Promise<ScriptResult> {
    const { system, user } = buildWriterMessages(input);
    const { voiceoverScript } = parseNarration(await this.chat(system, user));
    return { voiceoverScript, provider: this.name };
  }

  async breakdown(input: BreakdownInput): Promise<BreakdownResult> {
    const { system, user } = buildDirectorMessages(input);
    const { scenes } = parseBreakdown(await this.chat(system, user, 8000));
    return { scenes, provider: this.name };
  }

  async seo(input: SeoInput): Promise<SeoResult> {
    const { system, user } = buildSeoMessages(input);
    const out = parseSeo(await this.chat(system, user));
    return { ...out, provider: this.name };
  }

  async fixCaptions(input: CaptionFixInput): Promise<CaptionFixResult> {
    const { system, user } = buildCaptionFixMessages(input);
    const lines = parseCaptionFix(await this.chat(system, user, 4000));
    return { lines, provider: this.name };
  }
}
