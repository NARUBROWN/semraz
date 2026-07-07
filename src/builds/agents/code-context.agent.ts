import { Injectable } from '@nestjs/common';
import { FileSearchTool } from '../tools/file-search.tool';
import { TargetAdapter } from '../targets/target-adapter';
import {
  BuildRunResult,
  BuildTask,
  CodeContext,
  EntitySpec,
} from '../types/build.types';

@Injectable()
export class CodeContextAgent {
  constructor(
    private readonly fileSearch: FileSearchTool,
  ) {}

  async understand(params: {
    rootDir: string;
    entity?: EntitySpec;
    task?: BuildTask;
    adapter: TargetAdapter;
    previousFailures: BuildRunResult[];
  }): Promise<CodeContext> {
    const hints = params.task
      ? params.adapter.taskContextHints(params.task)
      : params.entity
        ? params.adapter.entityContextHints(params.entity)
        : [];
    const language = params.adapter.language;
    const hintedFiles = await this.fileSearch.search(params.rootDir, {
      extensions: [...language.sourceExtensions, ...language.configExtensions],
      hints,
    });
    const sourceFiles = await this.fileSearch.search(params.rootDir, {
      extensions: language.sourceExtensions,
    });
    const symbols = await language.searchSymbols(params.rootDir, sourceFiles);

    return {
      entity: params.entity,
      task: params.task,
      relevantFiles: this.prioritizeFiles(hintedFiles, sourceFiles),
      symbols: symbols.filter((symbol) =>
        hints.some((hint) => {
          const lowerHint = hint.toLowerCase();
          return (
            symbol.name.toLowerCase().includes(lowerHint) ||
            symbol.decorators.some((decorator) => decorator.toLowerCase().includes(lowerHint)) ||
            symbol.filePath.toLowerCase().includes(lowerHint)
          );
        }),
      ),
      previousFailures: params.previousFailures,
      instructions: language.contextInstructions,
    };
  }

  private prioritizeFiles(hintedFiles: string[], sourceFiles: string[]) {
    return Array.from(new Set([...hintedFiles, ...sourceFiles.slice(0, 30)])).sort();
  }
}
