import { OpenAICompatStrategy } from './openai-compat';

export class OpenAIStrategy extends OpenAICompatStrategy {
  readonly name = 'openai';
  protected readonly baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  protected model() {
    return process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }
  protected apiKey() {
    return process.env.OPENAI_API_KEY;
  }
}
