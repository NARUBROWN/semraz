import { OpenAiJsonClient } from '../llm/openai-json.client';
import { TargetAdapter } from '../targets/target-adapter';
import { CodeGenerationAgent } from './code-generation.agent';

describe('CodeGenerationAgent', () => {
  const task = {
    id: 'feature-widget-crud',
    kind: 'crud-feature' as const,
    title: 'Widget CRUD',
    description: '',
    targetEntity: 'Widget',
    dependsOn: [],
    allowedFiles: [
      'src/widget/widget.service.ts',
      'src/widget/widget.controller.ts',
    ],
    doneCriteria: [],
  };
  const spec = {
    projectName: 'Widgets',
    summary: '',
    entities: [],
    endpoints: [],
    businessRules: [],
    assumptions: [],
  };

  it('retries when the model omits a required task file', async () => {
    const llm = {
      generateJson: jest
        .fn()
        .mockResolvedValueOnce({
          files: [{ path: task.allowedFiles[0], content: 'service' }],
        })
        .mockResolvedValueOnce({
          files: task.allowedFiles.map((path) => ({ path, content: path })),
        }),
    } as unknown as OpenAiJsonClient;
    const adapter = {
      requiredTaskFiles: () => task.allowedFiles,
      normalizeGeneratedFiles: (files: unknown[]) => files,
      taskGenerationPrompt: () => '',
    } as unknown as TargetAdapter;

    const files = await new CodeGenerationAgent(llm).generateTaskFiles({
      spec,
      task,
      context: {
        task,
        relevantFiles: [],
        fileContents: [],
        symbols: [],
        previousFailures: [],
        instructions: [],
      },
      adapter,
    });

    expect(llm.generateJson).toHaveBeenCalledTimes(2);
    expect(files).toHaveLength(2);
  });

  it('rejects a replacement that changes a marked user-owned block', async () => {
    const block = [
      '// <semraz:user-code name="custom">',
      'customLogic();',
      '// </semraz:user-code>',
    ].join('\n');
    const llm = {
      generateJson: jest
        .fn()
        .mockResolvedValueOnce({
          files: task.allowedFiles.map((path) => ({
            path,
            content: 'rewritten',
          })),
        })
        .mockResolvedValueOnce({
          files: task.allowedFiles.map((path) => ({
            path,
            content: path.endsWith('service.ts') ? block : 'controller',
          })),
        }),
    } as unknown as OpenAiJsonClient;
    const adapter = {
      requiredTaskFiles: () => task.allowedFiles,
      normalizeGeneratedFiles: (files: unknown[]) => files,
      taskGenerationPrompt: () => '',
    } as unknown as TargetAdapter;

    const files = await new CodeGenerationAgent(llm).generateTaskFiles({
      spec,
      task,
      context: {
        task,
        relevantFiles: [task.allowedFiles[0]],
        fileContents: [{ path: task.allowedFiles[0], content: block }],
        symbols: [],
        previousFailures: [],
        instructions: [],
      },
      adapter,
    });

    expect(llm.generateJson).toHaveBeenCalledTimes(2);
    expect(files[0].content).toContain(block);
  });
});
