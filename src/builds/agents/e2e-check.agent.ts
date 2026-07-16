import { Injectable } from '@nestjs/common';
import { TargetAdapter } from '../targets/target-adapter';
import { ScopedTerminalTool } from '../../tools/scoped-terminal.tool';
import { BuildRunResult } from '../types/build.types';
import { AppSpec } from '../types/build.types';
import { BuildTask } from '../types/build.types';

@Injectable()
export class E2ECheckAgent {
  constructor(private readonly terminal: ScopedTerminalTool) {}

  async check(
    rootDir: string,
    adapter: TargetAdapter,
    spec?: AppSpec,
    task?: BuildTask,
  ): Promise<BuildRunResult> {
    const commands = adapter.e2eCheckCommands(spec, task);
    const results = await this.terminal.run(rootDir, commands);
    const success = results.every((result) => result.success);
    return {
      success,
      commands: results,
      errorSummary: success ? undefined : this.summarize(results),
    };
  }

  private summarize(results: BuildRunResult['commands']) {
    const failed = results.find((result) => !result.success);
    if (!failed) {
      return undefined;
    }
    return [failed.command, failed.stderr.trim(), failed.stdout.trim()]
      .filter(Boolean)
      .join('\n\n')
      .slice(-12_000);
  }
}
