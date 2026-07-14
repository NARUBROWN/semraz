import { TargetFramework } from '../../builds/types/build.types';
import { ScopedTerminalTool } from '../../tools/scoped-terminal.tool';
import { TestTargetAdapter } from '../targets/test-target-adapter';
import { TestExecutionAgent } from './test-execution.agent';

describe('TestExecutionAgent', () => {
  it('includes setup commands only when explicitly requested', async () => {
    const terminal = {
      run: jest
        .fn()
        .mockResolvedValue([
          {
            command: 'npm run test:cov',
            exitCode: 0,
            stdout: '',
            stderr: '',
            success: true,
          },
        ]),
    } as unknown as ScopedTerminalTool;
    const adapter = {
      target: TargetFramework.NestJS,
      setupCommands: () => [
        { command: 'npm', args: ['install'], description: 'install' },
      ],
      executionCommands: () => [
        { command: 'npm', args: ['run', 'test:cov'], description: 'test' },
      ],
      extractCoverageSummary: () => undefined,
      readCoverageGaps: async () => [],
    } as unknown as TestTargetAdapter;
    const agent = new TestExecutionAgent(terminal);

    await agent.run('/app', adapter, { includeSetup: true });
    await agent.run('/app', adapter);

    expect(terminal.run).toHaveBeenNthCalledWith(1, '/app', [
      expect.objectContaining({ args: ['install'] }),
      expect.objectContaining({ args: ['run', 'test:cov'] }),
    ]);
    expect(terminal.run).toHaveBeenNthCalledWith(2, '/app', [
      expect.objectContaining({ args: ['run', 'test:cov'] }),
    ]);
  });
});
