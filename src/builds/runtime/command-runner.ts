import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { CommandResult, CommandSpec } from '../types/build.types';

@Injectable()
export class CommandRunner {
  private readonly logger = new Logger(CommandRunner.name);

  async runAll(
    cwd: string,
    commands: CommandSpec[],
    timeoutMs = 180_000,
  ): Promise<CommandResult[]> {
    const results: CommandResult[] = [];

    for (const spec of commands) {
      const result = await this.run(cwd, spec, timeoutMs);
      results.push(result);
      if (!result.success) {
        this.logger.error(
          [
            `Generated application command failed: ${result.command}`,
            `Working directory: ${cwd}`,
            `Exit code: ${result.exitCode ?? 'spawn error or timeout'}`,
            result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : '',
            result.stdout.trim() ? `stdout:\n${result.stdout.trim()}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        );
        break;
      }
    }

    return results;
  }

  private run(cwd: string, spec: CommandSpec, timeoutMs: number) {
    return new Promise<CommandResult>((resolve) => {
      const child = spawn(spec.command, spec.args, {
        cwd,
        shell: false,
        env: this.commandEnvironment(spec),
      });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = this.appendBounded(stdout, chunk.toString());
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = this.appendBounded(stderr, chunk.toString());
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          command: this.formatCommand(spec),
          exitCode: null,
          stdout,
          stderr: this.appendBounded(stderr, error.message),
          success: false,
        });
      });
      child.on('close', (exitCode) => {
        clearTimeout(timer);
        resolve({
          command: this.formatCommand(spec),
          exitCode,
          stdout,
          stderr,
          success: exitCode === 0,
        });
      });
    });
  }

  private appendBounded(current: string, next: string) {
    const combined = current + next;
    return combined.length > 40_000 ? combined.slice(-40_000) : combined;
  }

  private commandEnvironment(spec: CommandSpec): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const [name, value] of Object.entries(spec.env ?? {})) {
      if (value === null) {
        delete env[name];
      } else {
        env[name] = value;
      }
    }
    return env;
  }

  private formatCommand(spec: CommandSpec) {
    return [spec.command, ...spec.args].join(' ');
  }
}
