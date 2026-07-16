import { TargetFramework } from '../../builds/types/build.types';
import { OpenAiJsonClient } from '../../builds/llm/openai-json.client';
import { TestTargetAdapter } from '../targets/test-target-adapter';
import { TestCodeGenerationAgent } from './test-code-generation.agent';

describe('TestCodeGenerationAgent', () => {
  it('accepts only the currently selected spec target from a model response', async () => {
    const llm = {
      generateJson: jest.fn().mockResolvedValue({
        files: [
          { path: 'src/a/a.service.spec.ts', content: "it('a', () => {});" },
          { path: 'src/b/b.service.spec.ts', content: "it('b', () => {});" },
        ],
      }),
    } as unknown as OpenAiJsonClient;
    const adapter = {
      target: TargetFramework.NestJS,
      harnessFiles: async () => [],
      testGenerationSystemPrompt: () => '',
      testGenerationPrompt: () => 'generate tests',
      normalizeTestFiles: (files: unknown[]) => files,
      isTestFile: (path: string) => path.endsWith('.spec.ts'),
      isPatchablePath: (path: string) => path.endsWith('.spec.ts'),
    } as unknown as TestTargetAdapter;

    const result = await new TestCodeGenerationAgent(llm).generate({
      appDir: '/app',
      spec: {
        projectName: 'x',
        summary: '',
        endpoints: [],
        businessRules: [],
        sourceDocs: [],
      },
      context: {
        relevantFiles: [],
        symbols: [],
        previousFailures: [],
        controllerContracts: [],
        failureDiagnoses: [],
        failedSpecPaths: [],
        instructions: [],
      },
      attempt: 1,
      coverageGaps: [],
      adapter,
      targetFile: 'src/a/a.service.spec.ts',
    });

    expect(result.files).toEqual([
      expect.objectContaining({ path: 'src/a/a.service.spec.ts' }),
    ]);
    expect((llm.generateJson as jest.Mock).mock.calls[0][0].user).toContain(
      'Generate or patch ONLY this exact test file',
    );
  });

  it('drops every generated patch that targets application source', async () => {
    const llm = {
      generateJson: jest.fn().mockResolvedValue({
        patches: [
          {
            path: 'src/widget/widget.service.ts',
            edits: [{ find: 'a', replace: 'b' }],
          },
          {
            path: 'src/widget/widget.service.spec.ts',
            edits: [{ find: 'a', replace: 'b' }],
          },
        ],
      }),
    } as unknown as OpenAiJsonClient;
    const adapter = {
      target: TargetFramework.NestJS,
      harnessFiles: async () => [],
      testGenerationSystemPrompt: () => '',
      testGenerationPrompt: () => '',
      normalizeTestFiles: (files: unknown[]) => files,
      isTestFile: (path: string) => path.endsWith('.spec.ts'),
      isPatchablePath: (path: string) => path.endsWith('.spec.ts'),
    } as unknown as TestTargetAdapter;

    const result = await new TestCodeGenerationAgent(llm).generate({
      appDir: '/app',
      spec: {
        projectName: 'x',
        summary: '',
        endpoints: [],
        businessRules: [],
        sourceDocs: [],
      },
      context: {
        relevantFiles: [],
        symbols: [],
        previousFailures: [],
        controllerContracts: [],
        failureDiagnoses: [],
        failedSpecPaths: [],
        instructions: [],
      },
      attempt: 1,
      coverageGaps: [],
      adapter,
    });

    expect(result.patches).toEqual([
      expect.objectContaining({ path: 'src/widget/widget.service.spec.ts' }),
    ]);
  });

  it('rejects a patch for a new spec and asks for a complete file instead', async () => {
    const llm = {
      generateJson: jest.fn().mockResolvedValue({
        patches: [
          {
            path: 'src/widget/widget.service.spec.ts',
            edits: [{ find: 'old', replace: 'new' }],
          },
        ],
      }),
    } as unknown as OpenAiJsonClient;
    const adapter = {
      target: TargetFramework.NestJS,
      harnessFiles: async () => [],
      testGenerationSystemPrompt: () => '',
      testGenerationPrompt: () => '',
      normalizeTestFiles: (files: unknown[]) => files,
      isTestFile: (path: string) => path.endsWith('.spec.ts'),
      isPatchablePath: (path: string) => path.endsWith('.spec.ts'),
    } as unknown as TestTargetAdapter;

    const result = await new TestCodeGenerationAgent(llm).generate({
      appDir: '/app',
      spec: {
        projectName: 'x',
        summary: '',
        endpoints: [],
        businessRules: [],
        sourceDocs: [],
      },
      context: {
        relevantFiles: [
          {
            path: 'src/widget/widget.service.ts',
            content: 'export class WidgetService {}',
          },
        ],
        symbols: [],
        previousFailures: [],
        controllerContracts: [],
        failureDiagnoses: [],
        failedSpecPaths: [],
        instructions: [],
      },
      attempt: 1,
      coverageGaps: [],
      adapter,
      targetFile: 'src/widget/widget.service.spec.ts',
    });

    expect(result.patches).toEqual([]);
    expect(result.patchFailures).toEqual([
      expect.objectContaining({
        path: 'src/widget/widget.service.spec.ts',
        reason: expect.stringMatching(/brand-new test spec/),
      }),
    ]);
  });

  it('rejects full-file regeneration for an existing failed spec', async () => {
    const llm = {
      generateJson: jest.fn().mockResolvedValue({
        files: [
          {
            path: 'src/widget/widget.service.spec.ts',
            content: "it('replacement', () => {});",
          },
        ],
      }),
    } as unknown as OpenAiJsonClient;
    const adapter = {
      target: TargetFramework.NestJS,
      harnessFiles: async () => [],
      testGenerationSystemPrompt: () => '',
      testGenerationPrompt: () => '',
      normalizeTestFiles: (files: unknown[]) => files,
      isTestFile: (path: string) => path.endsWith('.spec.ts'),
      isPatchablePath: (path: string) => path.endsWith('.spec.ts'),
    } as unknown as TestTargetAdapter;

    const result = await new TestCodeGenerationAgent(llm).generate({
      appDir: '/app',
      spec: {
        projectName: 'x',
        summary: '',
        endpoints: [],
        businessRules: [],
        sourceDocs: [],
      },
      context: {
        relevantFiles: [
          { path: 'src/widget/widget.service.spec.ts', content: 'existing' },
        ],
        symbols: [],
        previousFailures: [],
        controllerContracts: [],
        failureDiagnoses: [],
        failedSpecPaths: ['src/widget/widget.service.spec.ts'],
        instructions: [],
      },
      attempt: 2,
      coverageGaps: [],
      adapter,
      targetFile: 'src/widget/widget.service.spec.ts',
    });

    expect(result.files).toEqual([]);
  });

  it('asks the LLM again when patch find text is ambiguous in the current spec', async () => {
    const target = 'src/widget/widget.service.spec.ts';
    const duplicate =
      "jest.spyOn(repository, 'findOne').mockResolvedValue(null);";
    const content = [
      "it('first branch', async () => {",
      `  ${duplicate}`,
      '});',
      "it('second branch', async () => {",
      `  ${duplicate}`,
      '});',
    ].join('\n');
    const uniqueFind = [
      "it('first branch', async () => {",
      `  ${duplicate}`,
      '});',
    ].join('\n');
    const llm = {
      generateJson: jest
        .fn()
        .mockResolvedValueOnce({
          patches: [
            {
              path: target,
              edits: [{ find: duplicate, replace: '' }],
            },
          ],
        })
        .mockResolvedValueOnce({
          patches: [
            {
              path: target,
              edits: [
                {
                  find: uniqueFind,
                  replace: "it('first branch', async () => {});",
                },
              ],
            },
          ],
        }),
    } as unknown as OpenAiJsonClient;
    const adapter = {
      target: TargetFramework.NestJS,
      harnessFiles: async () => [],
      testGenerationSystemPrompt: () => '',
      testGenerationPrompt: () => 'repair target',
      normalizeTestFiles: (files: unknown[]) => files,
      isTestFile: (path: string) => path.endsWith('.spec.ts'),
      isPatchablePath: (path: string) => path.endsWith('.spec.ts'),
    } as unknown as TestTargetAdapter;

    const result = await new TestCodeGenerationAgent(llm).generate({
      appDir: '/app',
      spec: {
        projectName: 'x',
        summary: '',
        endpoints: [],
        businessRules: [],
        sourceDocs: [],
      },
      context: {
        relevantFiles: [{ path: target, content }],
        symbols: [],
        previousFailures: [],
        controllerContracts: [],
        failureDiagnoses: [],
        failedSpecPaths: [target],
        instructions: [],
      },
      attempt: 2,
      coverageGaps: [],
      adapter,
      targetFile: target,
    });

    expect(llm.generateJson).toHaveBeenCalledTimes(2);
    expect(result.patchFailures).toEqual([]);
    expect(result.patches[0].edits[0].find).toBe(uniqueFind);
    const retryPrompt = (llm.generateJson as jest.Mock).mock.calls[1][0].user;
    expect(retryPrompt).toContain('PREVIOUS RESPONSE WAS REJECTED');
    expect(retryPrompt).toContain('2 matches');
    expect(retryPrompt).toContain('Match 1 around line');
    expect(retryPrompt).toContain('Do not repeat the rejected find text');
  });

  it('uses the code-generation model and accepts application repair patches for a code defect', async () => {
    const target = 'src/widget/widget.service.spec.ts';
    const source = 'src/widget/widget.service.ts';
    const generateJson = jest.fn().mockResolvedValue({
      classification: 'CODE_DEFECT',
      diagnosis: 'The required missing-entity branch is not implemented.',
      applicationPatches: [
        {
          path: source,
          edits: [
            {
              find: 'return this.repository.save(entity);',
              replace:
                "if (!owner) throw new NotFoundException('Owner not found');\n    return this.repository.save(entity);",
            },
          ],
        },
      ],
    });
    const llm = {
      generateJson,
      codeGenerationModel: jest.fn().mockReturnValue('gpt-5-codex'),
    } as unknown as OpenAiJsonClient;
    const adapter = {
      target: TargetFramework.NestJS,
      harnessFiles: async () => [],
      testGenerationSystemPrompt: () => '',
      testGenerationPrompt: () => 'repair target',
      normalizeTestFiles: (files: unknown[]) => files,
      isTestFile: (path: string) => path.endsWith('.spec.ts'),
      isPatchablePath: (path: string) => path.endsWith('.spec.ts'),
    } as unknown as TestTargetAdapter;

    const result = await new TestCodeGenerationAgent(llm).generate({
      appDir: '/app',
      spec: {
        projectName: 'x',
        summary: '',
        endpoints: [],
        businessRules: ['Missing owners must be rejected.'],
        sourceDocs: [],
      },
      context: {
        relevantFiles: [
          { path: target, content: "it('rejects missing owner', () => {});" },
          {
            path: source,
            content: 'return this.repository.save(entity);',
          },
        ],
        symbols: [],
        previousFailures: [],
        controllerContracts: [],
        failureDiagnoses: [],
        failedSpecPaths: [target],
        instructions: [],
      },
      attempt: 2,
      coverageGaps: [],
      adapter,
      targetFile: target,
    });

    expect(generateJson).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-5-codex' }),
    );
    expect(result.classification).toBe('CODE_DEFECT');
    expect(result.applicationPatches).toEqual([
      expect.objectContaining({ path: source }),
    ]);
    expect(result.patches).toEqual([]);
    expect(result.patchFailures).toEqual([]);
  });
});
