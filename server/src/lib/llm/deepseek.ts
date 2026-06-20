import { OpenAICompatStrategy } from './openai-compat';

// DeepSeek exposes an OpenAI-compatible API at https://api.deepseek.com.
export class DeepseekStrategy extends OpenAICompatStrategy {
  readonly name = 'deepseek';
  protected readonly baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  protected model() {
    return process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  }
  protected apiKey() {
    return process.env.DEEPSEEK_API_KEY;
  }
}
