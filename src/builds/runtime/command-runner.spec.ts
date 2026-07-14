import { CommandRunner } from './command-runner';

describe('CommandRunner', () => {
  it('can remove inherited environment variables for an isolated command', async () => {
    process.env.SEMRAZ_COMMAND_RUNNER_TEST = 'production-secret';
    const runner = new CommandRunner();

    try {
      const [result] = await runner.runAll(process.cwd(), [
        {
          command: process.execPath,
          args: [
            '-e',
            "process.stdout.write(`${process.env.SEMRAZ_COMMAND_RUNNER_TEST ?? 'missing'}:${process.env.NODE_ENV}`)",
          ],
          description: 'Check isolated environment',
          env: {
            SEMRAZ_COMMAND_RUNNER_TEST: null,
            NODE_ENV: 'test',
          },
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('missing:test');
    } finally {
      delete process.env.SEMRAZ_COMMAND_RUNNER_TEST;
    }
  });

  it('logs command details and captured output when a generated app command fails', async () => {
    const runner = new CommandRunner() as any;
    runner.run = jest.fn().mockResolvedValue({
      command: 'npm run build',
      exitCode: 1,
      stdout: 'Found 1 error.',
      stderr: 'src/app.ts:1:1 - error TS1005',
      success: false,
    });
    const logError = jest.spyOn(runner.logger, 'error').mockImplementation();

    const results = await runner.runAll('/tmp/generated-app', [
      { command: 'npm', args: ['run', 'build'] },
    ]);

    expect(results).toHaveLength(1);
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('Generated application command failed: npm run build'),
    );
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('src/app.ts:1:1 - error TS1005'),
    );
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('Working directory: /tmp/generated-app'),
    );
  });
});
