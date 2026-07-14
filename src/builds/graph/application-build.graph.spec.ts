import { ApplicationBuildGraph } from './application-build.graph';

describe('ApplicationBuildGraph final-build repair helpers', () => {
  // The repair helpers only touch `this.workspace`; the other constructor deps
  // are irrelevant here, so a bag of stubs is enough to reach them.
  const makeGraph = (
    files: Record<string, string>,
    commandRunner: object = {},
  ) => {
    const workspace = {
      resolveInside: (root: string, rel: string) => `${root}/${rel}`,
      readTextFile: async (absolute: string) => {
        const key = absolute.replace(/^ROOT\//, '');
        if (!(key in files)) {
          throw new Error(`no such file: ${key}`);
        }
        return files[key];
      },
      listFiles: async () => Object.keys(files),
    };
    return new ApplicationBuildGraph(
      {} as never,
      commandRunner as never,
      workspace as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as any;
  };

  describe('extractErrorFilePaths', () => {
    it('pulls src/*.ts paths out of ANSI-coloured nest build output', () => {
      const graph = makeGraph({});
      const summary = [
        '\x1b[96msrc/promotion-campaign/promotion-campaign.entity.ts\x1b[0m:\x1b[93m21\x1b[0m:\x1b[93m50\x1b[0m - error TS2339',
        'src/sales-record/sales-record.entity.ts:19:50 - error TS2339',
        'Found 2 error(s).',
      ].join('\n');

      expect(graph.extractErrorFilePaths(summary)).toEqual([
        'src/promotion-campaign/promotion-campaign.entity.ts',
        'src/sales-record/sales-record.entity.ts',
      ]);
    });

    it('returns nothing when no source path is present', () => {
      const graph = makeGraph({});
      expect(graph.extractErrorFilePaths('npm ERR! build failed')).toEqual([]);
    });
  });

  describe('collectFinalRepairFiles', () => {
    it('includes each flagged file AND the local entity it imports (where the fix lives)', async () => {
      const graph = makeGraph({
        'src/promotion-campaign/promotion-campaign.entity.ts':
          "import { Artwork } from '../artwork/artwork.entity';\nexport class PromotionCampaign {}\n",
        'src/artwork/artwork.entity.ts': 'export class Artwork {}\n',
        'src/unrelated/unrelated.service.ts': 'export class Unrelated {}\n',
      });

      const files = await graph.collectFinalRepairFiles(
        'ROOT',
        'src/promotion-campaign/promotion-campaign.entity.ts:21:50 - error TS2339',
      );
      const paths = files.map((f: { path: string }) => f.path).sort();

      // The imported target entity (artwork) must be present; the unrelated file must not.
      expect(paths).toContain('src/artwork/artwork.entity.ts');
      expect(paths).toContain(
        'src/promotion-campaign/promotion-campaign.entity.ts',
      );
      expect(paths).not.toContain('src/unrelated/unrelated.service.ts');
    });

    it('falls back to the full source set when no path can be parsed', async () => {
      const graph = makeGraph({
        'src/a.ts': 'export const a = 1;\n',
        'src/b.ts': 'export const b = 2;\n',
      });

      const files = await graph.collectFinalRepairFiles(
        'ROOT',
        'opaque failure',
      );
      expect(files.map((f: { path: string }) => f.path).sort()).toEqual([
        'src/a.ts',
        'src/b.ts',
      ]);
    });
  });

  describe('nextAfterFinalBuild', () => {
    const graph = makeGraph({});

    it('runs the final smoke gate once the build succeeds', () => {
      expect(
        graph.nextAfterFinalBuild({
          buildResult: { success: true },
          finalRepairAttempts: 0,
        }),
      ).toBe('runFinalSmoke');
    });

    it('repairs while the build fails and the budget remains', () => {
      expect(
        graph.nextAfterFinalBuild({
          buildResult: { success: false },
          finalRepairAttempts: 0,
        }),
      ).toBe('repairFinalBuild');
    });

    it('stops repairing once the attempt budget is exhausted', () => {
      expect(
        graph.nextAfterFinalBuild({
          buildResult: { success: false },
          finalRepairAttempts: 8,
        }),
      ).toBe('packageArtifact');
    });
  });

  it('keeps a marked class member inside its original class', () => {
    const graph = makeGraph({});
    const previous = [
      'export class AppController {',
      '  // <semraz:user-code name="custom">',
      '  custom() { return 1; }',
      '  // </semraz:user-code>',
      '}',
    ].join('\n');
    const generated = 'export class AppController {\n  health() {}\n}\n';
    const merged = graph.mergePreservedUserBlocks(generated, previous);
    expect(merged.indexOf('custom()')).toBeLessThan(merged.lastIndexOf('}'));
    expect(merged).toContain('health()');
  });

  it('marks the overall build failed when any planned task failed', async () => {
    const graph = makeGraph({ 'src/app.ts': 'export {};' });
    const result = await graph.packageArtifact({
      outputDir: 'ROOT',
      buildResult: { success: true, commands: [] },
      buildPlan: { tasks: [] },
      completedTasks: [
        {
          taskId: 'feature-user-crud',
          title: 'User CRUD',
          success: false,
          attempts: 8,
          changedFiles: [],
        },
      ],
      spec: { entities: [] },
    });

    expect(result.buildResult.success).toBe(false);
    expect(result.buildResult.errorSummary).toContain('feature-user-crud');
  });

  it('runs install commands only until dependency setup succeeds', async () => {
    const runAll = jest.fn().mockResolvedValue([
      {
        command: 'npm install',
        success: true,
        stdout: '',
        stderr: '',
        exitCode: 0,
      },
      {
        command: 'npm run build',
        success: true,
        stdout: '',
        stderr: '',
        exitCode: 0,
      },
    ]);
    const graph = makeGraph({}, { runAll });
    const plan = {
      installCommands: [
        { command: 'npm', args: ['install'], description: 'install' },
      ],
      buildCommands: [
        { command: 'npm', args: ['run', 'build'], description: 'build' },
      ],
    };

    const first = await graph.runBuild({
      outputDir: 'ROOT',
      plan,
      dependenciesReady: false,
    });
    await graph.runBuild({
      outputDir: 'ROOT',
      plan,
      dependenciesReady: first.dependenciesReady,
    });

    expect(runAll.mock.calls[0][1]).toHaveLength(2);
    expect(runAll.mock.calls[1][1]).toHaveLength(1);
    expect(runAll.mock.calls[1][1][0].args).toEqual(['run', 'build']);
  });

  it('parses ERD NN fields and relation annotations deterministically', () => {
    const graph = makeGraph({});
    const spec = graph.parseMarkdownSpec({
      request: { outputName: 'app' },
      docs: [
        { path: 'docs/PROJECT.md', content: '# App' },
        {
          path: 'docs/ERD.md',
          content: [
            '## Entity: Draft',
            '| Column | Type | PK | NN |',
            '| --- | --- | --- | --- |',
            '| id | uuid | yes | yes |',
            '| title | string | no | yes |',
            '',
            '## Entity: Review',
            '| Column | Type | PK | NN |',
            '| --- | --- | --- | --- |',
            '| id | uuid | yes | yes |',
            '',
            '## Relationships',
            '- Draft 1:N Review (two-way)',
          ].join('\n'),
        },
      ],
    });

    expect(spec.entities[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'title', required: true }),
      ]),
    );
    expect(spec.entities[0].relations).toEqual(
      expect.arrayContaining([expect.objectContaining({ target: 'Review' })]),
    );
  });
});
