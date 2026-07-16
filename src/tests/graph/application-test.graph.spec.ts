import { ApplicationTestGraph } from './application-test.graph';

describe('ApplicationTestGraph progress details', () => {
  const graph = new ApplicationTestGraph(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  ) as any;

  it('reports generated spec paths and named Jest cases', () => {
    expect(
      graph.generatedTestProgress('Generating framework test code', {
        generatedFiles: [
          {
            path: 'src/vehicle/vehicle.service.spec.ts',
            content: [
              "describe('VehicleService', () => {",
              "  it('creates a vehicle', async () => {});",
              "  test('rejects a duplicate plate', async () => {});",
              '});',
            ].join('\n'),
          },
        ],
        currentPatches: [
          { path: 'src/schedule/schedule.service.spec.ts', edits: [] },
        ],
      }),
    ).toEqual({
      generatedTests: [
        {
          path: 'src/vehicle/vehicle.service.spec.ts',
          cases: [
            'VehicleService',
            'creates a vehicle',
            'rejects a duplicate plate',
          ],
        },
      ],
      patchedTestFiles: ['src/schedule/schedule.service.spec.ts'],
    });
  });

  it('emits elapsed-time progress while a test phase is still running', async () => {
    jest.useFakeTimers();
    const events: Array<{ detail?: Record<string, unknown> }> = [];
    let finishNode!: (value: Record<string, never>) => void;
    const nodeResult = new Promise<Record<string, never>>((resolve) => {
      finishNode = resolve;
    });

    try {
      const wrapped = graph.withProgress(
        'Generating framework test code',
        () => nodeResult,
        (event: { detail?: Record<string, unknown> }) => events.push(event),
      );
      const running = wrapped({ attempts: 0 });

      jest.advanceTimersByTime(15_000);
      expect(events.at(-1)?.detail).toEqual(
        expect.objectContaining({
          attempt: 1,
          heartbeat: true,
          elapsedSeconds: 15,
        }),
      );

      finishNode({});
      await running;
    } finally {
      jest.useRealTimers();
    }
  });

  it('announces planned spec targets before the generation response arrives', () => {
    expect(
      graph.testGenerationTargetProgress('Generating framework test code', {
        context: {
          failedSpecPaths: [],
          relevantFiles: [
            { path: 'src/vehicle/vehicle.controller.ts', content: '' },
            { path: 'src/vehicle/vehicle.service.ts', content: '' },
            { path: 'src/vehicle/vehicle.entity.ts', content: '' },
          ],
        },
      }),
    ).toEqual({
      plannedTestFiles: [
        'src/vehicle/vehicle.controller.spec.ts',
        'src/vehicle/vehicle.service.spec.ts',
      ],
    });
  });

  it('allows up to twenty attempts and clamps larger requests', () => {
    graph.workspace = { resolveProjectDir: (value: string) => value };

    expect(
      graph.normalizeRequest({
        appDir: '/app',
        maxAttempts: 99,
      }).maxAttempts,
    ).toBe(20);
    expect(graph.normalizeRequest({ appDir: '/app' }).maxAttempts).toBe(20);
  });

  it('does not run Jest when a generated test patch cannot be applied', async () => {
    const execution = { run: jest.fn() };
    const codePatch = {
      applyPlainFileReplacements: jest.fn().mockResolvedValue([]),
      applyEditPatches: jest.fn().mockResolvedValue({
        applied: [],
        failures: [
          {
            path: 'src/widget/widget.service.spec.ts',
            reason: 'file does not exist; return it as a full file instead',
          },
        ],
      }),
    };
    const adapter = {
      isTestFile: (path: string) => path.endsWith('.spec.ts'),
    };
    const isolatedGraph = new ApplicationTestGraph(
      {} as never,
      codePatch as never,
      {} as never,
      {} as never,
      {
        generate: jest.fn().mockResolvedValue({
          files: [],
          patches: [
            {
              path: 'src/widget/widget.service.spec.ts',
              edits: [{ find: 'old', replace: 'new' }],
            },
          ],
          patchFailures: [],
        }),
      } as never,
      execution as never,
      { get: jest.fn().mockReturnValue(adapter) } as never,
    ) as any;

    const result = await isolatedGraph.generateTestsSequentially({
      request: { appDir: '/app', target: 'nestjs', maxAttempts: 2 },
      spec: {
        projectName: 'Test',
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
      attempts: 0,
      dependenciesReady: true,
      testRuns: 0,
      coverageGaps: [],
      patchFailures: [],
    });

    expect(execution.run).not.toHaveBeenCalled();
    expect(result.patchFailures).toEqual([
      expect.objectContaining({ path: 'src/widget/widget.service.spec.ts' }),
    ]);
    expect(result.testResult.errorSummary).toContain(
      'failed to apply test patch',
    );
  });

  it('scopes aggregate failures and patch failures to the current target', async () => {
    const first = 'src/a/a.service.spec.ts';
    const second = 'src/b/b.service.spec.ts';
    const generate = jest.fn(async (params: { targetFile: string }) => ({
      files: [{ path: params.targetFile, content: "it('works', () => {});" }],
      patches: [],
      patchFailures: [],
    }));
    const execution = {
      run: jest.fn().mockResolvedValue({ success: true, commands: [] }),
    };
    const isolatedGraph = new ApplicationTestGraph(
      {} as never,
      {
        applyPlainFileReplacements: jest.fn().mockResolvedValue([]),
        applyEditPatches: jest
          .fn()
          .mockResolvedValue({ applied: [], failures: [] }),
      } as never,
      {} as never,
      {} as never,
      { generate } as never,
      execution as never,
      {
        get: jest.fn().mockReturnValue({
          isTestFile: (path: string) => path.endsWith('.spec.ts'),
        }),
      } as never,
    ) as any;

    await isolatedGraph.generateTestsSequentially({
      request: { appDir: '/app', target: 'nestjs', maxAttempts: 3 },
      spec: {
        projectName: 'Test',
        summary: '',
        endpoints: [],
        businessRules: [],
        sourceDocs: [],
      },
      context: {
        relevantFiles: [],
        symbols: [],
        previousFailures: [
          {
            success: false,
            commands: [],
            errorSummary: `FAIL ${first}\nA_ONLY\n\nFAIL ${second}\nB_ONLY`,
          },
        ],
        controllerContracts: [],
        failureDiagnoses: [],
        failedSpecPaths: [first, second],
        instructions: [],
      },
      attempts: 1,
      dependenciesReady: true,
      testRuns: 0,
      coverageGaps: [],
      patchFailures: [
        { path: first, reason: 'A_PATCH' },
        { path: second, reason: 'B_PATCH' },
      ],
    });

    const firstParams = generate.mock.calls[0][0] as any;
    const secondParams = generate.mock.calls[1][0] as any;
    expect(firstParams.context.previousFailures[0].errorSummary).toContain(
      'A_ONLY',
    );
    expect(firstParams.context.previousFailures[0].errorSummary).not.toContain(
      'B_ONLY',
    );
    expect(firstParams.patchFailures).toEqual([
      { path: first, reason: 'A_PATCH' },
    ]);
    expect(secondParams.context.previousFailures[0].errorSummary).toContain(
      'B_ONLY',
    );
    expect(secondParams.context.previousFailures[0].errorSummary).not.toContain(
      'A_ONLY',
    );
    expect(secondParams.patchFailures).toEqual([
      { path: second, reason: 'B_PATCH' },
    ]);
  });

  it('applies a CODE_DEFECT application patch before rerunning the same target spec', async () => {
    const target = 'src/widget/widget.service.spec.ts';
    const source = 'src/widget/widget.service.ts';
    const applyEditPatches = jest
      .fn()
      .mockResolvedValue({ applied: [source], failures: [] });
    const execution = {
      run: jest.fn().mockResolvedValue({ success: true, commands: [] }),
    };
    const isolatedGraph = new ApplicationTestGraph(
      {} as never,
      {
        applyPlainFileReplacements: jest.fn().mockResolvedValue([]),
        applyEditPatches,
      } as never,
      {} as never,
      {} as never,
      {
        generate: jest.fn().mockResolvedValue({
          files: [],
          patches: [],
          applicationPatches: [
            {
              path: source,
              edits: [{ find: 'old', replace: 'fixed' }],
            },
          ],
          patchFailures: [],
          classification: 'CODE_DEFECT',
          diagnosis: 'The implementation is missing required behavior.',
        }),
      } as never,
      execution as never,
      {
        get: jest.fn().mockReturnValue({
          isTestFile: (path: string) => path.endsWith('.spec.ts'),
        }),
      } as never,
    ) as any;

    const result = await isolatedGraph.generateTestsSequentially({
      request: { appDir: '/app', target: 'nestjs', maxAttempts: 3 },
      spec: {
        projectName: 'Test',
        summary: '',
        endpoints: [],
        businessRules: [],
        sourceDocs: [],
      },
      context: {
        relevantFiles: [
          { path: target, content: "it('fails faithfully', () => {});" },
          { path: source, content: 'old' },
        ],
        symbols: [],
        previousFailures: [],
        controllerContracts: [],
        failureDiagnoses: [],
        failedSpecPaths: [target],
        instructions: [],
      },
      attempts: 1,
      dependenciesReady: true,
      testRuns: 0,
      coverageGaps: [],
      patchFailures: [],
    });

    expect(applyEditPatches).toHaveBeenCalledWith(
      '/app',
      [expect.objectContaining({ path: source })],
      undefined,
    );
    expect(execution.run).toHaveBeenCalledWith(
      '/app',
      expect.anything(),
      { includeSetup: false, targetFile: target },
    );
    expect(result.changedFiles).toContain(source);
    expect(result.targetValidationFailed).toBe(false);
  });
});
