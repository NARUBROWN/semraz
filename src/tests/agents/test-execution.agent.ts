import { Injectable } from '@nestjs/common';
import { ScopedTerminalTool } from '../../tools/scoped-terminal.tool';
import { TestTargetAdapter } from '../targets/test-target-adapter';
import { TestRunResult } from '../types/test.types';

@Injectable()
export class TestExecutionAgent {
  constructor(private readonly terminal: ScopedTerminalTool) {}

  async run(
    appDir: string,
    adapter: TestTargetAdapter,
    options: { includeSetup?: boolean; targetFile?: string } = {},
  ): Promise<TestRunResult> {
    const executionCommands = options.targetFile
      ? adapter.targetExecutionCommands(options.targetFile)
      : adapter.executionCommands();
    const commands = [
      ...(options.includeSetup ? adapter.setupCommands() : []),
      ...executionCommands,
    ];
    const results = await this.terminal.run(appDir, commands);
    const success = results.every((result) => result.success);
    const output = results
      .flatMap((result) => [result.stdout, result.stderr])
      .filter(Boolean)
      .join('\n');

    const counts = adapter.extractTestCounts?.(output);

    return {
      success,
      commands: results,
      errorSummary: success
        ? undefined
        : this.summarize(results, adapter, output),
      coverageSummary: options.targetFile
        ? undefined
        : adapter.extractCoverageSummary(output),
      coverageGaps: options.targetFile
        ? []
        : await adapter.readCoverageGaps(appDir),
      testsPassed: counts?.passed,
      testsFailed: counts?.failed,
      testsTotal: counts?.total,
    };
  }

  private summarize(
    results: TestRunResult['commands'],
    adapter: TestTargetAdapter,
    output: string,
  ) {
    const failed = results.find((result) => !result.success);
    if (!failed) {
      return undefined;
    }

    // Prefer the adapter's failure extractor, which pulls the actual failing
    // test blocks to the front. The raw tail-slice fallback is a last resort:
    // runners print the coverage table AFTER the errors, so a naive tail can
    // drop the real cause out of the window.
    const focused = adapter.extractFailureSummary?.(output);
    if (focused) {
      return focused;
    }

    return [failed.command, failed.stderr.trim(), failed.stdout.trim()]
      .filter(Boolean)
      .join('\n\n')
      .slice(-16_000);
  }
}
