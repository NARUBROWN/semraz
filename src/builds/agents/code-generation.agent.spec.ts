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

  it('uses an independent LLM review and feeds its rejection into the next repair attempt', async () => {
    const repairTask = {
      ...task,
      allowedFiles: [
        'src/widget/widget.service.ts',
        'src/widget/widget.module.ts',
      ],
    };
    const generateJson = jest
      .fn()
      .mockResolvedValueOnce({
        files: repairTask.allowedFiles.map((path) => ({
          path,
          content:
            path === 'src/widget/widget.module.ts'
              ? 'TypeOrmModule.forFeature([Widget])'
              : '@InjectRepository(Owner) repository: Repository<Owner>',
        })),
      })
      .mockResolvedValueOnce({
        approved: false,
        problems: [
          'src/widget/widget.module.ts must register Owner in TypeOrmModule.forFeature',
        ],
      })
      .mockResolvedValueOnce({
        files: repairTask.allowedFiles.map((path) => ({
          path,
          content:
            path === 'src/widget/widget.module.ts'
              ? 'TypeOrmModule.forFeature([Widget, Owner])'
              : '@InjectRepository(Owner) repository: Repository<Owner>',
        })),
      })
      .mockResolvedValueOnce({ approved: true, problems: [] });
    const llm = { generateJson } as unknown as OpenAiJsonClient;
    const adapter = {
      requiredTaskFiles: () => repairTask.allowedFiles,
      normalizeGeneratedFiles: (files: unknown[]) => files,
      taskGenerationPrompt: () => 'base generation instructions',
    } as unknown as TargetAdapter;

    const files = await new CodeGenerationAgent(llm).generateTaskFiles({
      spec,
      task: repairTask,
      context: {
        task: repairTask,
        relevantFiles: repairTask.allowedFiles,
        fileContents: [],
        symbols: [],
        previousFailures: [
          {
            success: false,
            commands: [],
            errorSummary:
              "Nest can't resolve dependencies: OwnerRepository is unavailable in WidgetModule",
          },
        ],
        instructions: [],
      },
      adapter,
    });

    expect(generateJson).toHaveBeenCalledTimes(4);
    expect(generateJson).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        user: expect.stringContaining('STRUCTURED REPAIR DIAGNOSTICS'),
      }),
    );
    expect(generateJson).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        user: expect.stringContaining('expectedFix'),
      }),
    );
    expect(
      files.find((file) => file.path.endsWith('.module.ts'))?.content,
    ).toContain('Widget, Owner');
    expect(generateJson).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        user: expect.stringContaining('must register Owner'),
      }),
    );
  });

  it('independently reviews a high-risk first-pass task before accepting it', async () => {
    const generateJson = jest
      .fn()
      .mockResolvedValueOnce({
        files: task.allowedFiles.map((path) => ({ path, content: path })),
      })
      .mockResolvedValueOnce({ approved: true, problems: [] });
    const llm = { generateJson } as unknown as OpenAiJsonClient;
    const adapter = {
      requiredTaskFiles: () => task.allowedFiles,
      normalizeGeneratedFiles: (files: unknown[]) => files,
      taskGenerationPrompt: () => 'base generation instructions',
      requiresIndependentTaskReview: () => true,
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

    expect(files).toHaveLength(2);
    expect(generateJson).toHaveBeenCalledTimes(2);
    expect(generateJson).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        user: expect.stringContaining('first-pass candidate'),
      }),
    );
  });

  it('validates a partial repair against the effective state while returning only changed files', async () => {
    const repairTask = {
      ...task,
      allowedFiles: [
        'src/widget/widget.service.ts',
        'src/widget/widget.module.ts',
      ],
    };
    const generateJson = jest
      .fn()
      .mockResolvedValueOnce({
        files: [
          {
            path: 'src/widget/widget.module.ts',
            content: 'TypeOrmModule.forFeature([Widget, Owner])',
          },
        ],
      })
      .mockResolvedValueOnce({ approved: true, problems: [] });
    const llm = { generateJson } as unknown as OpenAiJsonClient;
    const validateTaskFiles = jest.fn().mockReturnValue([]);
    const adapter = {
      requiredTaskFiles: () => repairTask.allowedFiles,
      normalizeGeneratedFiles: (files: unknown[]) => files,
      validateTaskFiles,
      taskGenerationPrompt: () => 'base generation instructions',
    } as unknown as TargetAdapter;

    const files = await new CodeGenerationAgent(llm).generateTaskFiles({
      spec,
      task: repairTask,
      context: {
        task: repairTask,
        relevantFiles: repairTask.allowedFiles,
        fileContents: [
          {
            path: 'src/widget/widget.service.ts',
            content: '@InjectRepository(Owner) repository: Repository<Owner>',
          },
          {
            path: 'src/widget/widget.module.ts',
            content: 'TypeOrmModule.forFeature([Widget])',
          },
        ],
        symbols: [],
        previousFailures: [
          {
            success: false,
            commands: [],
            errorSummary: 'OwnerRepository is unavailable in WidgetModule',
          },
        ],
        instructions: [],
      },
      adapter,
    });

    expect(files).toEqual([
      {
        path: 'src/widget/widget.module.ts',
        content: 'TypeOrmModule.forFeature([Widget, Owner])',
      },
    ]);
    expect(validateTaskFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        files: expect.arrayContaining([
          expect.objectContaining({
            path: 'src/widget/widget.service.ts',
          }),
          expect.objectContaining({
            path: 'src/widget/widget.module.ts',
            content: 'TypeOrmModule.forFeature([Widget, Owner])',
          }),
        ]),
      }),
    );
    expect(generateJson).toHaveBeenCalledTimes(2);
  });
});
