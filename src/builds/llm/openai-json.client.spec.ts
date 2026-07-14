import { OpenAiJsonClient } from './openai-json.client';

describe('OpenAiJsonClient', () => {
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
