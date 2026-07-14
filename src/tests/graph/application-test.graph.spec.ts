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
        currentPatches: [{ path: 'src/schedule/schedule.service.spec.ts', edits: [] }],
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
});
