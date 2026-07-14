import { TestCodebaseSearchAgent } from './test-codebase-search.agent';

describe('TestCodebaseSearchAgent', () => {
  it('turns a missing controller method failure into an explicit bad-test diagnosis', async () => {
    const files: Record<string, string> = {
      'src/draft/draft.controller.ts': [
        "import { Controller, Post } from '@nestjs/common';",
        "@Controller('drafts')",
        'export class DraftController {',
        '  @Post()',
        '  create() {}',
        '}',
      ].join('\n'),
      'src/draft/draft.controller.spec.ts': 'describe(\'DraftController\', () => {});',
      'package.json': '{}',
    };
    const fileSearch = {
      search: jest.fn(async (_root: string, options: { extensions: string[] }) => {
        if (options.extensions.includes('.ts')) {
          return [
            'src/draft/draft.controller.ts',
            'src/draft/draft.controller.spec.ts',
          ];
        }
        if (options.extensions.includes('.json')) {
          return ['package.json'];
        }
        return [];
      }),
    };
    const workspace = {
      resolveInside: (_root: string, filePath: string) => filePath,
      readTextFile: async (filePath: string) => files[filePath],
    };
    const language = {
      sourceExtensions: ['.ts'],
      configExtensions: ['.json'],
      searchSymbols: jest.fn().mockResolvedValue([]),
    };
    const agent = new TestCodebaseSearchAgent(
      fileSearch as never,
      workspace as never,
      language as never,
    );

    const context = await agent.search({
      appDir: '/app',
      spec: {
        projectName: 'Test',
        summary: '',
        endpoints: [],
        businessRules: [],
        sourceDocs: [],
      },
      previousFailures: [
        {
          success: false,
          commands: [],
          errorSummary: [
            'FAIL src/draft/draft.controller.spec.ts',
            'TypeError: draftController.findOne is not a function',
          ].join('\n'),
        },
      ],
    });

    expect(context.controllerContracts).toEqual([
      expect.objectContaining({
        className: 'DraftController',
        filePath: 'src/draft/draft.controller.ts',
        methods: [expect.objectContaining({ name: 'create', httpMethod: 'POST' })],
      }),
    ]);
    expect(context.failureDiagnoses).toEqual([
      expect.objectContaining({
        kind: 'missing-controller-method',
        missingMethod: 'findOne',
        availableMethods: ['create'],
      }),
    ]);
    expect(context.failedSpecPaths).toEqual([
      'src/draft/draft.controller.spec.ts',
    ]);
  });
});
