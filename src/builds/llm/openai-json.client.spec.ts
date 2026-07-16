import { OpenAiJsonClient } from './openai-json.client';

describe('OpenAiJsonClient', () => {
  it('uses a longer configurable timeout for code-generation requests', () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') return undefined;
        if (key === 'OPENAI_TIMEOUT_MS') return '240000';
        if (key === 'OPENAI_MAX_RETRIES') return '1';
        return undefined;
      }),
    };
    const client = new OpenAiJsonClient(config as never, {} as never) as any;

    expect(client.timeoutMs).toBe(240_000);
    expect(client.maxRetries).toBe(1);
  });

  it('defaults to a three-minute timeout and two retries', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const client = new OpenAiJsonClient(config as never, {} as never) as any;

    expect(client.timeoutMs).toBe(180_000);
    expect(client.maxRetries).toBe(2);
    expect(client.codeGenerationModel()).toBe('gpt-5-codex');
  });

  it('uses OPENAI_CODE_MODEL independently from the general-purpose model', () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_MODEL') return 'gpt-4o-mini';
        if (key === 'OPENAI_CODE_MODEL') return 'gpt-5-codex';
        return undefined;
      }),
    };
    const client = new OpenAiJsonClient(config as never, {} as never);

    expect(client.codeGenerationModel()).toBe('gpt-5-codex');
  });

  it('always includes the literal json requirement in the Responses input', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'OPENAI_API_KEY' ? 'test-key' : 'gpt-5-codex',
      ),
    };
    const usageRepo = {
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const create = jest.fn().mockResolvedValue({
      output_text: '{"ok":true}',
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    });
    const client = new OpenAiJsonClient(config as never, usageRepo as never);
    (client as any).client = { responses: { create } };

    await expect(
      client.generateJson({
        system: 'Return structured output.',
        user: 'Repair the failing TypeScript file.',
        context: { caller: 'test' },
      }),
    ).resolves.toEqual({ ok: true });

    expect(create.mock.calls[0][0].input).toMatch(/\bjson\b/);
    expect(create.mock.calls[0][0]).not.toHaveProperty('temperature');
  });
});
