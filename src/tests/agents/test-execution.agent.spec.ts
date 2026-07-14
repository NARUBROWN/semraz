import { TargetFramework } from '../../builds/types/build.types';
import { ScopedTerminalTool } from '../../tools/scoped-terminal.tool';
import { TestTargetAdapter } from '../targets/test-target-adapter';
import { TestExecutionAgent } from './test-execution.agent';

describe('TestExecutionAgent', () => {
  it('runs only the selected spec during per-file verification', async () => {
    const terminal = {
      run: jest.fn().mockResolvedValue([
        {
          command: 'npm run test -- --runTestsByPath src/a.spec.ts',
          exitCode: 0,
          stdout: 'Tests: 1 passed, 1 total',
          stderr: '',
          success: true,
        },
      ]),
    } as unknown as ScopedTerminalTool;
    const adapter = {
      targetExecutionCommands: (targetFile: string) => [
        { command: 'npm', args: ['test', targetFile], description: 'target' },
      ],
      executionCommands: () => [],
      setupCommands: () => [],
      extractTestCounts: () => ({ passed: 1, failed: 0, total: 1 }),
      readCoverageGaps: jest.fn(),
    } as unknown as TestTargetAdapter;

    await new TestExecutionAgent(terminal).run('/app', adapter, {
      targetFile: 'src/a.spec.ts',
    });

    expect(terminal.run).toHaveBeenCalledWith('/app', [
      expect.objectContaining({ args: ['test', 'src/a.spec.ts'] }),
    ]);
    expect(adapter.readCoverageGaps).not.toHaveBeenCalled();
  });

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
