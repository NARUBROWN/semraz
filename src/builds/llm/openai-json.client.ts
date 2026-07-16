import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI from 'openai';
import { Repository } from 'typeorm';
import { LlmUsageLog } from './llm-usage-log.entity';

export type LlmCallContext = {
  userId?: string;
  workspaceId?: string;
  caller: string;
};

@Injectable()
export class OpenAiJsonClient {
  private readonly client?: OpenAI;
  private readonly model: string;
  private readonly codeModel: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(
    config: ConfigService,
    @InjectRepository(LlmUsageLog)
    private readonly usageRepo: Repository<LlmUsageLog>,
  ) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.timeoutMs = this.positiveInteger(
      config.get<string>('OPENAI_TIMEOUT_MS'),
      180_000,
    );
    this.maxRetries = this.nonNegativeInteger(
      config.get<string>('OPENAI_MAX_RETRIES'),
      2,
    );
    this.client = apiKey
      ? new OpenAI({
          apiKey,
          timeout: this.timeoutMs,
          maxRetries: this.maxRetries,
        })
      : undefined;
    this.model = config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
    this.codeModel =
      config.get<string>('OPENAI_CODE_MODEL') ?? 'gpt-5-codex';
  }

  codeGenerationModel(): string {
    return this.codeModel;
  }

  async generateJson<T>(params: {
    system: string;
    user: string;
    /** Overrides the generator default for specialized flows such as ideation. */
    model?: string;
    temperature?: number;
    context?: LlmCallContext;
  }): Promise<T> {
    if (!this.client) {
      throw new InternalServerErrorException('OPENAI_API_KEY is not configured');
    }

    const start = Date.now();
    const model = params.model ?? this.model;

    const response = await this.client.responses.create({
      model,
      // GPT-5/Codex models use fixed sampling and reject temperature.
      ...(this.supportsTemperature(model)
        ? { temperature: params.temperature ?? 0.1 }
        : {}),
      // Keep the existing JSON contract while using the endpoint required by
      // GPT-5/Codex models.
      text: { format: { type: 'json_object' } },
      instructions: params.system,
      // Some Responses API models validate JSON-mode eligibility against the
      // actual input messages only (not `instructions`) and require the literal
      // word "json" to appear there. Enforce that invariant centrally so a
      // specialized repair prompt cannot fail merely because it says JSON only
      // in the system instruction.
      input: `Respond with exactly one valid json object and no surrounding text.\n\n${params.user}`,
      store: false,
    });

    const durationMs = Date.now() - start;
    const usage = response.usage;

    const logEntry = this.usageRepo.create({
      userId: params.context?.userId ?? null,
      workspaceId: params.context?.workspaceId ?? null,
      model,
      caller: params.context?.caller ?? 'unknown',
      promptTokens: usage?.input_tokens ?? 0,
      completionTokens: usage?.output_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
      durationMs,
    });
    this.usageRepo.save(logEntry).catch((err) => {
      console.error('[LlmUsageLog] Failed to save usage log:', err?.message ?? err);
    });

    const content = response.output_text;
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

  private supportsTemperature(model: string): boolean {
    return !model.toLowerCase().startsWith('gpt-5');
  }

  private positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private nonNegativeInteger(
    value: string | undefined,
    fallback: number,
  ): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
  }
}
