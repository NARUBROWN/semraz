import { CommandRunner } from './command-runner';

describe('CommandRunner', () => {
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
