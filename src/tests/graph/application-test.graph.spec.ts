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
});
