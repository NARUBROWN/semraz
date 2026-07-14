import { NestJsTestAdapter } from './nestjs-test.adapter';
import { GeneratedFile } from '../../builds/types/build.types';
import { WorkspaceWriter } from '../../builds/runtime/workspace-writer';

describe('NestJsTestAdapter', () => {
  const adapter = new NestJsTestAdapter({} as never);

  const normalize = (content: string): string =>
    adapter.normalizeTestFiles([
      { path: 'src/health-metric/health-metric.controller.spec.ts', content },
    ])[0].content;

  it('installs local test tools even when the server runs in production mode', () => {
    expect(adapter.setupCommands()).toEqual([
      expect.objectContaining({
        command: 'npm',
        args: ['install', '--include=dev'],
      }),
    ]);
  });

  it('runs generated tests without inheriting the Semraz production database', () => {
    expect(adapter.executionCommands()).toEqual([
      expect.objectContaining({
        env: {
          DATABASE_URL: null,
          NODE_ENV: 'test',
          PORT: null,
        },
      }),
    ]);
  });

  it('adds a managed Supertest E2E contract suite to every generated app', async () => {
    const workspace = {
      resolveInside: (_rootDir: string, filePath: string) => filePath,
      readTextFile: jest
        .fn()
        .mockResolvedValue(
          JSON.stringify({
            name: 'generated-app',
            scripts: {},
            devDependencies: {},
          }),
        ),
    } as unknown as WorkspaceWriter;
    const files = await new NestJsTestAdapter(workspace).harnessFiles('/app', {
      projectName: 'Generated app',
      summary: '',
      endpoints: [
        {
          entityName: 'Vehicle',
          operationName: 'Create vehicle',
          method: 'POST',
          path: '/vehicles',
          description: '',
          requestFields: [{ name: 'name', type: 'string' }],
          responseFields: [],
        },
      ],
      businessRules: [],
      sourceDocs: [],
    });
    const byPath = new Map(files.map((file) => [file.path, file.content]));

    expect(
      JSON.parse(byPath.get('package.json')!).scripts['test:e2e'],
    ).toContain('test/app.e2e-spec.ts');
    expect(byPath.get('test/app.e2e-spec.ts')).toContain(
      "import request from 'supertest'",
    );
    expect(byPath.get('test/app.e2e-spec.ts')).toContain('Create vehicle');
    expect(byPath.get('test/app.e2e-spec.ts')).toContain('propertiesOf');
  });

  it('builds a Jest command that verifies only one selected spec', () => {
    expect(
      adapter.targetExecutionCommands('src/vehicle/vehicle.service.spec.ts'),
    ).toEqual([
      expect.objectContaining({
        command: 'npm',
        args: [
          'run',
          'test',
          '--',
          '--runTestsByPath',
          'src/vehicle/vehicle.service.spec.ts',
        ],
      }),
    ]);
  });

  it('injects a missing @nestjs/common exception import into a spec', () => {
    // Reproduces "ReferenceError: NotFoundException is not defined": the spec
    // uses the exception but never imports it.
    const spec = [
      "import { Test } from '@nestjs/testing';",
      "import { HealthMetricController } from './health-metric.controller';",
      '',
      "it('throws', async () => {",
      "  jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException('x'));",
      '  await expect(controller.findOne(id)).rejects.toThrow(NotFoundException);',
      '});',
      '',
    ].join('\n');

    const output = normalize(spec);

    expect(output).toContain(
      "import { NotFoundException } from '@nestjs/common';",
    );
  });

  it('merges the missing exception into an existing @nestjs/common import', () => {
    const spec = [
      "import { BadRequestException } from '@nestjs/common';",
      '',
      "it('throws', async () => {",
      "  jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException('x'));",
      '});',
      '',
    ].join('\n');

    const output = normalize(spec);
    const commonImport = output.match(
      /import\s+\{([^}]+)\}\s+from\s+'@nestjs\/common';/,
    );

    expect(commonImport).not.toBeNull();
    const names = commonImport![1].split(',').map((name) => name.trim());
    expect(names).toContain('BadRequestException');
    expect(names).toContain('NotFoundException');
    // Must not duplicate the @nestjs/common import line.
    expect(output.match(/from '@nestjs\/common'/g)).toHaveLength(1);
  });

  it('leaves a spec that already imports its exception untouched', () => {
    const spec = [
      "import { NotFoundException } from '@nestjs/common';",
      '',
      "it('throws', () => {",
      '  throw new NotFoundException();',
      '});',
      '',
    ].join('\n');

    expect(normalize(spec)).toBe(spec);
  });

  it('does not touch non-spec files', () => {
    const source: GeneratedFile = {
      path: 'src/health-metric/health-metric.controller.ts',
      content: 'export class HealthMetricController {}\n',
    };
    expect(adapter.normalizeTestFiles([source])[0]).toEqual(source);
  });

  it('replaces a real controller service with a deterministic service mock', () => {
    const [file] = adapter.normalizeTestFiles(
      [
        {
          path: 'src/traffic/traffic.controller.spec.ts',
          content: [
            "import { Test } from '@nestjs/testing';",
            "import { TrafficController } from './traffic.controller';",
            "import { TrafficService } from './traffic.service';",
            "import { Traffic } from './traffic.entity';",
            'let controller: TrafficController;',
            'let service: TrafficService;',
            'beforeEach(async () => {',
            '  const module = await Test.createTestingModule({',
            '    controllers: [TrafficController],',
            '    providers: [TrafficService, { provide: getRepositoryToken(Traffic), useValue: {} }],',
            '  }).compile();',
            '  service = module.get(TrafficService);',
            '});',
            "it('works', async () => { jest.spyOn(service, 'findAll').mockResolvedValue([]); });",
          ].join('\n'),
        },
      ],
      {
        relevantFiles: [
          {
            path: 'src/traffic/traffic.controller.ts',
            content: 'export class TrafficController {}',
          },
          {
            path: 'src/traffic/traffic.service.ts',
            content: 'export class TrafficService {}',
          },
          {
            path: 'src/traffic/traffic.entity.ts',
            content: 'export class Traffic {}',
          },
        ],
        symbols: [],
        previousFailures: [],
        controllerContracts: [],
        failureDiagnoses: [],
        failedSpecPaths: [],
        instructions: [],
      },
    );

    expect(file.content).toContain(
      'providers: [{ provide: TrafficService, useValue: { findAll: jest.fn() } }]',
    );
    expect(file.content).not.toContain('getRepositoryToken');
  });

  it('removes an invented relative import and its invalid provider', () => {
    const [file] = adapter.normalizeTestFiles(
      [
        {
          path: 'src/app.controller.spec.ts',
          content: [
            "import { Test } from '@nestjs/testing';",
            "import { AppController } from './app.controller';",
            "import { AppService } from './app.service';",
            'beforeEach(async () => {',
            '  await Test.createTestingModule({',
            '    controllers: [AppController],',
            '    providers: [AppService],',
            '  }).compile();',
            '});',
          ].join('\n'),
        },
      ],
      {
        relevantFiles: [
          {
            path: 'src/app.controller.ts',
            content: 'export class AppController {}',
          },
        ],
        symbols: [],
        previousFailures: [],
        controllerContracts: [],
        failureDiagnoses: [],
        failedSpecPaths: [],
        instructions: [],
      },
    );

    expect(file.content).not.toContain("'./app.service'");
    expect(file.content).not.toContain('AppService');
  });

  it('rejects a generated controller spec that calls a method absent from the AST contract', () => {
    const files: GeneratedFile[] = [
      {
        path: 'src/draft/draft.controller.spec.ts',
        content: [
          "import { DraftController } from './draft.controller';",
          'let draftController: DraftController;',
          '',
          "it('looks up a draft', async () => {",
          "  await draftController.findOne('draft-id');",
          '});',
          '',
        ].join('\n'),
      },
    ];

    expect(
      adapter.normalizeTestFiles(files, {
        relevantFiles: [],
        symbols: [],
        previousFailures: [],
        controllerContracts: [
          {
            className: 'DraftController',
            filePath: 'src/draft/draft.controller.ts',
            methods: [{ name: 'create', httpMethod: 'POST' }],
          },
        ],
        failureDiagnoses: [],
        failedSpecPaths: [],
        instructions: [],
      }),
    ).toEqual([]);
  });

  it('accepts generated controller tests that call contracted methods', () => {
    const files: GeneratedFile[] = [
      {
        path: 'src/draft/draft.controller.spec.ts',
        content: [
          "import { DraftController } from './draft.controller';",
          'let draftController: DraftController;',
          '',
          "it('creates a draft', async () => {",
          '  await draftController.create({} as never);',
          '});',
          '',
        ].join('\n'),
      },
    ];

    expect(
      adapter.normalizeTestFiles(files, {
        relevantFiles: [],
        symbols: [],
        previousFailures: [],
        controllerContracts: [
          {
            className: 'DraftController',
            filePath: 'src/draft/draft.controller.ts',
            methods: [{ name: 'create', httpMethod: 'POST' }],
          },
        ],
        failureDiagnoses: [],
        failedSpecPaths: [],
        instructions: [],
      }),
    ).toHaveLength(1);
  });

  describe('isPatchablePath', () => {
    it('allows patches only to spec files', () => {
      expect(
        adapter.isPatchablePath('src/audit-log/audit-log.service.spec.ts'),
      ).toBe(true);
      expect(
        adapter.isPatchablePath('src/audit-log/audit-log.controller.spec.ts'),
      ).toBe(true);
      expect(
        adapter.isPatchablePath('src/audit-log/audit-log.service.ts'),
      ).toBe(false);
    });

    it('never patches declarative glue or the pipeline-owned harness', () => {
      // DTOs/entities/controllers/modules are off-limits so a stray edit cannot
      // corrupt them; validation lives in the pipe and controllers only delegate.
      expect(
        adapter.isPatchablePath('src/audit-log/dto/update-audit-log.dto.ts'),
      ).toBe(false);
      expect(
        adapter.isPatchablePath('src/audit-log/audit-log.controller.ts'),
      ).toBe(false);
      expect(adapter.isPatchablePath('src/audit-log/audit-log.entity.ts')).toBe(
        false,
      );
      expect(adapter.isPatchablePath('src/app.module.ts')).toBe(false);
      expect(adapter.isPatchablePath('package.json')).toBe(false);
      expect(adapter.isPatchablePath('test/app.e2e-spec.ts')).toBe(false);
    });
  });

  it('does not weaken a specification assertion after application behavior disagrees', async () => {
    const workspace = {
      readTextFile: jest.fn(),
    } as unknown as WorkspaceWriter;

    const repairs = await adapter.repairGeneratedTests({
      appDir: '/app',
      errorSummary: [
        'FAIL src/widget/widget.service.spec.ts',
        'Received promise resolved instead of rejected',
        'Resolved to value: null',
        '> 5 | await expect(service.findOne(id)).rejects.toThrow(NotFoundException);',
      ].join('\n'),
      workspace,
    });

    expect(repairs).toEqual([]);
    expect(workspace.readTextFile).not.toHaveBeenCalled();
  });

  it('removes module.get calls that run before the testing module declaration', async () => {
    const spec = [
      "describe('Controller', () => {",
      '  let service: Service;',
      '  beforeEach(async () => {',
      '    service = module.get<Service>(Service);',
      '    const module: TestingModule = await Test.createTestingModule({}).compile();',
      '    service = module.get<Service>(Service);',
      '  });',
      '});',
    ].join('\n');
    const workspace = {
      resolveInside: (_rootDir: string, filePath: string) => filePath,
      readTextFile: jest.fn().mockResolvedValue(spec),
    } as unknown as WorkspaceWriter;

    const repairs = await adapter.repairGeneratedTests({
      appDir: '/app',
      errorSummary: [
        'FAIL src/controller.spec.ts',
        "ReferenceError: Cannot access 'module' before initialization",
      ].join('\n'),
      workspace,
    });

    expect(repairs).toHaveLength(1);
    expect(
      repairs[0].content.match(/service = module\.get<Service>\(Service\);/g),
    ).toHaveLength(1);
    expect(repairs[0].content.indexOf('const module')).toBeLessThan(
      repairs[0].content.indexOf('service = module.get'),
    );
  });

  it('aligns a generated remove test with a void service using repository.delete', async () => {
    const spec = [
      'useValue: {',
      '  remove: jest.fn(),',
      '},',
      "describe('remove', () => {",
      "  jest.spyOn(repository, 'remove').mockResolvedValue(result);",
      '  expect(await service.remove(id)).toEqual(result);',
      '});',
    ].join('\n');
    const workspace = {
      resolveInside: (_rootDir: string, filePath: string) => filePath,
      readTextFile: jest.fn().mockResolvedValue(spec),
    } as unknown as WorkspaceWriter;

    const repairs = await adapter.repairGeneratedTests({
      appDir: '/app',
      errorSummary: [
        'FAIL src/item/item.service.spec.ts',
        'TypeError: this.itemRepository.delete is not a function',
      ].join('\n'),
      workspace,
      context: {
        relevantFiles: [
          {
            path: 'src/item/item.service.ts',
            content:
              'class ItemService { async remove(id: string): Promise<void> { await this.itemRepository.delete(id); } }',
          },
        ],
        symbols: [],
        previousFailures: [],
        controllerContracts: [],
        failureDiagnoses: [],
        failedSpecPaths: ['src/item/item.service.spec.ts'],
        instructions: [],
      },
    });

    expect(repairs[0].content).toContain('delete: jest.fn()');
    expect(repairs[0].content).toContain("spyOn(repository, 'delete')");
    expect(repairs[0].content).toContain('.toBeUndefined()');
  });

  it('removes only test cases that call a controller method absent from its contract', async () => {
    const spec = [
      'let draftController: DraftController;',
      '',
      "it('creates', async () => {",
      '  await draftController.create({} as never);',
      '});',
      '',
      "it('looks up a draft', async () => {",
      "  await draftController.findOne('draft-id');",
      '});',
      '',
    ].join('\n');
    const workspace = {
      resolveInside: (_rootDir: string, filePath: string) => filePath,
      readTextFile: jest.fn().mockResolvedValue(spec),
    } as unknown as WorkspaceWriter;

    const repairs = await adapter.repairGeneratedTests({
      appDir: '/app',
      errorSummary: 'TypeError: draftController.findOne is not a function',
      workspace,
      context: {
        relevantFiles: [],
        symbols: [],
        previousFailures: [],
        controllerContracts: [
          {
            className: 'DraftController',
            filePath: 'src/draft/draft.controller.ts',
            methods: [{ name: 'create', httpMethod: 'POST' }],
          },
        ],
        failureDiagnoses: [
          {
            filePath: 'src/draft/draft.controller.spec.ts',
            kind: 'missing-controller-method',
            missingMethod: 'findOne',
            availableMethods: ['create'],
            message: 'DraftController.findOne does not exist.',
          },
        ],
        failedSpecPaths: ['src/draft/draft.controller.spec.ts'],
        instructions: [],
      },
    });

    expect(repairs).toEqual([
      {
        path: 'src/draft/draft.controller.spec.ts',
        content: expect.not.stringContaining('draftController.findOne'),
      },
    ]);
    expect(repairs[0].content).toContain('draftController.create');
  });

  it('repairs duplicate lexical declarations reported by Jest', async () => {
    const spec = [
      "describe('CertificationController', () => {",
      '  let certificationService: unknown;',
      '  let certificationService: unknown;',
      '});',
      '',
    ].join('\n');
    const workspace = {
      resolveInside: (_rootDir: string, filePath: string) => filePath,
      readTextFile: jest.fn().mockResolvedValue(spec),
    } as unknown as WorkspaceWriter;

    const repairs = await adapter.repairGeneratedTests({
      appDir: '/app',
      errorSummary: [
        'FAIL src/certification/certification.controller.spec.ts',
        "SyntaxError: Identifier 'certificationService' has already been declared",
      ].join('\n'),
      workspace,
    });

    expect(repairs).toEqual([
      {
        path: 'src/certification/certification.controller.spec.ts',
        content: [
          "describe('CertificationController', () => {",
          '  let certificationService: unknown;',
          '});',
          '',
        ].join('\n'),
      },
    ]);
  });

  describe('validatePatchedSyntax', () => {
    it('rejects a test patch that redeclares a lexical variable in the same scope', () => {
      const duplicate = [
        "describe('CertificationController', () => {",
        '  let certificationService: unknown;',
        '  let certificationService: unknown;',
        '});',
        '',
      ].join('\n');

      expect(
        adapter.validatePatchedSyntax(
          'src/certification/certification.controller.spec.ts',
          duplicate,
        ),
      ).toBe(
        "TS2451: Cannot redeclare block-scoped variable 'certificationService'.",
      );
    });

    it('flags a spec left unparseable by a malformed patch', () => {
      // The exact corruption a bad find/replace produced live: a one-line guard
      // plus a leftover throw + extra "}" that closes the method early.
      const broken = [
        "import { Injectable, BadRequestException } from '@nestjs/common';",
        '@Injectable()',
        'export class DataReviewService {',
        '  async create(dto) {',
        "    if (!dto.id) { throw new BadRequestException('x'); }",
        "      throw new BadRequestException('x');",
        '    }',
        '    return this.repo.save(dto);',
        '  }',
        '}',
        '',
      ].join('\n');

      const error = adapter.validatePatchedSyntax(
        'src/data-review/data-review.service.spec.ts',
        broken,
      );
      expect(error).toBeDefined();
      expect(error).toMatch(/^TS\d+:/);
    });

    it('accepts a valid spec and does not false-positive on unresolved imports/types', () => {
      const valid = [
        "import { Injectable, BadRequestException } from '@nestjs/common';",
        "import { Made } from './nowhere';", // unresolved import must NOT be flagged
        '@Injectable()',
        'export class S {',
        '  async create(dto: Made) {',
        "    if (!dto) { throw new BadRequestException('x'); }",
        '    return dto;',
        '  }',
        '}',
        '',
      ].join('\n');

      expect(
        adapter.validatePatchedSyntax('src/x/x.service.spec.ts', valid),
      ).toBeUndefined();
    });

    it('ignores non-TypeScript paths', () => {
      expect(
        adapter.validatePatchedSyntax('package.json', '{ not valid ts ]'),
      ).toBeUndefined();
    });
  });

  describe('extractTestCounts', () => {
    it('parses an all-passing summary', () => {
      expect(
        adapter.extractTestCounts('Tests:       14 passed, 14 total\n'),
      ).toEqual({
        passed: 14,
        failed: 0,
        total: 14,
      });
    });

    it('parses a mixed pass/fail summary regardless of field order', () => {
      expect(
        adapter.extractTestCounts('Tests:       2 failed, 3 passed, 5 total'),
      ).toEqual({ passed: 3, failed: 2, total: 5 });
    });

    it('uses the LAST Tests line (the repair re-run wins) and strips ANSI', () => {
      const output = [
        '\x1b[1mTests:\x1b[0m       2 failed, 3 passed, 5 total',
        'more logs...',
        'Tests:       5 passed, 5 total',
      ].join('\n');
      expect(adapter.extractTestCounts(output)).toEqual({
        passed: 5,
        failed: 0,
        total: 5,
      });
    });

    it('returns undefined when there is no Tests summary line', () => {
      expect(
        adapter.extractTestCounts('Test Suites: 1 failed\n'),
      ).toBeUndefined();
    });
  });

  describe('extractFailureSummary', () => {
    it('pulls the failing block to the front and drops the coverage table', () => {
      const output = [
        'PASS src/user/user.controller.spec.ts',
        'FAIL src/health-metric/health-metric.controller.spec.ts',
        '  ● HealthMetricController › findOne › should throw NotFoundException',
        '',
        '    ReferenceError: NotFoundException is not defined',
        '      76 |',
        '    > 78 |   ...mockRejectedValue(new NotFoundException(...));',
        '',
        'Test Suites: 1 failed, 1 passed, 2 total',
        'Tests:       1 failed, 10 passed, 11 total',
        '----------|---------|----------|---------|---------|',
        'File      | % Stmts | % Branch | % Funcs | % Lines |',
        '----------|---------|----------|---------|---------|',
        'All files |   98.11 |    70.00 |  100.00 |  100.00 |',
      ].join('\n');

      const summary = adapter.extractFailureSummary(output)!;

      expect(summary).toContain(
        'ReferenceError: NotFoundException is not defined',
      );
      expect(summary).toContain('Tests:       1 failed');
      // The coverage table must not dominate the summary.
      expect(summary).not.toContain('% Branch');
      expect(summary).not.toContain('All files |');
    });

    it('returns undefined when there is no failure block', () => {
      expect(
        adapter.extractFailureSummary('PASS everything\n'),
      ).toBeUndefined();
    });
  });

  describe('testGenerationPrompt', () => {
    const baseParams = {
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
        instructions: [],
      },
      attempt: 1,
      coverageGaps: [],
    };

    it('surfaces the previous failure at the top and instructs patch-first', () => {
      const prompt = adapter.testGenerationPrompt({
        ...baseParams,
        attempt: 2,
        context: {
          ...baseParams.context,
          previousFailures: [
            {
              success: false,
              commands: [],
              errorSummary: 'ReferenceError: NotFoundException is not defined',
            },
          ],
        },
      });

      // Failure appears near the very top, before the long instruction list.
      expect(
        prompt.indexOf('FIX THIS TEST FAILURE FIRST'),
      ).toBeGreaterThanOrEqual(0);
      expect(prompt.indexOf('NotFoundException is not defined')).toBeLessThan(
        prompt.indexOf('Coverage target'),
      );
      expect(prompt).toContain('Prefer targeted "patches"');
      expect(prompt).toContain('"edits"');
    });

    it('does not dump the raw previousFailures blob into the context section', () => {
      const prompt = adapter.testGenerationPrompt({
        ...baseParams,
        context: {
          ...baseParams.context,
          previousFailures: [
            {
              success: false,
              commands: [
                {
                  command: 'jest',
                  exitCode: 1,
                  stdout: 'HUGE_NOISY_COVERAGE_TABLE',
                  stderr: '',
                  success: false,
                },
              ],
              errorSummary: 'the real error',
            },
          ],
        },
      });

      expect(prompt).not.toContain('HUGE_NOISY_COVERAGE_TABLE');
    });

    it('lists unapplied patch failures so the model resends them', () => {
      const prompt = adapter.testGenerationPrompt({
        ...baseParams,
        patchFailures: [
          { path: 'src/a.spec.ts', reason: 'find text not present: foo' },
        ],
      });

      expect(prompt).toContain('did NOT apply');
      expect(prompt).toContain('src/a.spec.ts');
    });
  });
});
