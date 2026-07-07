import { BadRequestException, Injectable } from '@nestjs/common';
import { CommandRunner } from '../runtime/command-runner';
import { CommandSpec } from '../types/build.types';

const ALLOWED_COMMANDS = new Set(['npm', 'node', 'python3', 'go']);

@Injectable()
export class ScopedTerminalTool {
  constructor(private readonly commandRunner: CommandRunner) {}

  async run(rootDir: string, commands: CommandSpec[]) {
    for (const command of commands) {
      if (!ALLOWED_COMMANDS.has(command.command)) {
        throw new BadRequestException(`Command is not allowed: ${command.command}`);
      }
    }

    return this.commandRunner.runAll(rootDir, commands);
  }
}
