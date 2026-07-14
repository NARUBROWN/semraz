import { TargetFramework } from '../../builds/types/build.types';
import { OpenAiJsonClient } from '../../builds/llm/openai-json.client';
import { TestTargetAdapter } from '../targets/test-target-adapter';
import { TestCodeGenerationAgent } from './test-code-generation.agent';

describe('TestCodeGenerationAgent', () => {
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
});
