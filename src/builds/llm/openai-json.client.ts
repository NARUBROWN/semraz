import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenAiJsonClient {
  private readonly client?: OpenAI;
  private readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.client = apiKey ? new OpenAI({ apiKey, timeout: 60000 }) : undefined;
    this.model = config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
  }

  async generateJson<T>(params: {
    system: string;
    user: string;
    temperature?: number;
  }): Promise<T> {
    if (!this.client) {
      throw new InternalServerErrorException('OPENAI_API_KEY is not configured');
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: params.temperature ?? 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new InternalServerErrorException('OpenAI returned an empty response');
    }

    try {
      return JSON.parse(content) as T;
    } catch (error) {
      throw new InternalServerErrorException(
        `OpenAI returned invalid JSON: ${(error as Error).message}`,
      );
    }
  }
}
