import { Injectable } from '@nestjs/common';
import { FileSearchTool } from '../../tools/file-search.tool';
import { OpenAiJsonClient } from '../llm/openai-json.client';
import { WorkspaceWriter } from '../runtime/workspace-writer';
import { TargetAdapter } from '../targets/target-adapter';
import {
  BuildRunResult,
  BuildTask,
  CodeContext,
  EntitySpec,
} from '../types/build.types';

const MAX_CONTEXT_FILES = 30;
const MAX_FILE_CONTENT_CHARS = 8000;
const MAX_FAILURE_FILE_CONTENT_CHARS = 40000;
const CONTEXT_MAP_BATCH_SIZE = 50;
const MAP_SELECTION_SIZE = 12;
const MAP_CONCURRENCY = 3;

@Injectable()
export class CodeContextAgent {
  constructor(
    private readonly fileSearch: FileSearchTool,
    private readonly llm: OpenAiJsonClient,
    private readonly workspace: WorkspaceWriter,
  ) {}

  async understand(params: {
    rootDir: string;
    entity?: EntitySpec;
    task?: BuildTask;
    adapter: TargetAdapter;
    previousFailures: BuildRunResult[];
    workspaceId?: string;
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
    const failureFiles = this.extractFailureFilePaths(params.previousFailures);

    const relevantFiles = await this.selectRelevantFiles({
      task: params.task,
      entity: params.entity,
      hintedFiles,
      sourceFiles,
      failureFiles,
      workspaceId: params.workspaceId,
    });
    const fileContents = await this.readFileContents(
      params.rootDir,
      relevantFiles,
      new Set(failureFiles),
    );

    return {
      entity: params.entity,
      task: params.task,
      relevantFiles,
      fileContents,
      symbols: symbols.filter(
        (symbol) =>
          relevantFiles.includes(symbol.filePath) ||
          hints.some((hint) => {
            const lowerHint = hint.toLowerCase();
            return (
              symbol.name.toLowerCase().includes(lowerHint) ||
              symbol.decorators.some((decorator) =>
                decorator.toLowerCase().includes(lowerHint),
              ) ||
              symbol.filePath.toLowerCase().includes(lowerHint)
            );
          }),
      ),
      previousFailures: params.previousFailures,
      instructions: language.contextInstructions,
    };
  }

  private async selectRelevantFiles(params: {
    task?: BuildTask;
    entity?: EntitySpec;
    hintedFiles: string[];
    sourceFiles: string[];
    failureFiles: string[];
    workspaceId?: string;
  }): Promise<string[]> {
    const allFiles = Array.from(
      new Set([...params.hintedFiles, ...params.sourceFiles]),
    ).sort();
    const required = Array.from(
      new Set([
        ...params.failureFiles.filter((path) => allFiles.includes(path)),
        ...(params.task?.allowedFiles ?? []).filter((path) =>
          allFiles.includes(path),
        ),
      ]),
    );

    // Nothing to choose between yet (early tasks on a small tree).
    if (allFiles.length <= 10 || (!params.task && !params.entity)) {
      return this.prioritizeFiles(
        required,
        params.hintedFiles,
        params.sourceFiles,
      );
    }

    try {
      if (allFiles.length > CONTEXT_MAP_BATCH_SIZE) {
        const batches = this.chunk(allFiles, CONTEXT_MAP_BATCH_SIZE);
        const mapped = await this.mapWithConcurrency(
          batches,
          MAP_CONCURRENCY,
          (batch, index) =>
            this.selectContextMap({
              ...params,
              availableFiles: batch,
              mapIndex: index + 1,
              mapCount: batches.length,
            }),
        );
        // Reduce phase: reserve task-owned files, then merge independently
        // selected map candidates. This prevents a large project file list from
        // ever entering one prompt or silently truncating later batches.
        return this.prioritizeFiles(
          required,
          params.hintedFiles.filter((file) => mapped.flat().includes(file)),
          mapped.flat(),
        );
      }

      const result = await this.llm.generateJson<{ relevantFiles: string[] }>({
        system:
          'You select which existing source files a code generation agent must read before executing a task. Return JSON only with shape {"relevantFiles": string[]}.',
        user: [
          'Choose up to 30 files that are most relevant to the task below.',
          'Always include files the task is allowed to modify when they already exist.',
          'Always include files named by the verification failures; they contain the exact repair location.',
          'Include files the new code will import from or register into (entities, modules, shared DTOs).',
          'relevantFiles must be an array of paths copied exactly from the available files list.',
          '',
          'Task:',
          JSON.stringify(
            params.task ?? { targetEntity: params.entity?.name },
            null,
            2,
          ),
          '',
          'Available files:',
          JSON.stringify(allFiles, null, 2),
        ].join('\n'),
        temperature: 0,
        context: {
          workspaceId: params.workspaceId,
          caller: `code-context:${params.task?.id ?? params.entity?.name ?? 'unknown'}`,
        },
      });

      const available = new Set(allFiles);
      const chosen = (result?.relevantFiles ?? [])
        .filter((path) => typeof path === 'string' && available.has(path))
        .slice(0, 30);

      if (chosen.length > 0) {
        // Task-allowed files must always be present when they exist on disk.
        return Array.from(new Set([...required, ...chosen])).slice(
          0,
          MAX_CONTEXT_FILES,
        );
      }
    } catch {
      // fall through to the heuristic
    }

    return this.prioritizeFiles(
      required,
      params.hintedFiles,
      params.sourceFiles,
    );
  }

  private async selectContextMap(params: {
    task?: BuildTask;
    entity?: EntitySpec;
    availableFiles: string[];
    workspaceId?: string;
    mapIndex: number;
    mapCount: number;
  }): Promise<string[]> {
    try {
      const result = await this.llm.generateJson<{ relevantFiles: string[] }>({
        system:
          'You are the map phase of code-context selection. Return JSON only with shape {"relevantFiles": string[]}.',
        user: [
          `Map shard ${params.mapIndex}/${params.mapCount}.`,
          `Choose up to ${MAP_SELECTION_SIZE} files from this shard that are relevant to the task.`,
          'Copy paths exactly and do not return paths outside this shard.',
          'Task:',
          JSON.stringify(
            params.task ?? { targetEntity: params.entity?.name },
            null,
            2,
          ),
          'Shard files:',
          JSON.stringify(params.availableFiles, null, 2),
        ].join('\n'),
        temperature: 0,
        context: {
          workspaceId: params.workspaceId,
          caller: `code-context:map:${params.task?.id ?? params.entity?.name ?? 'unknown'}:${params.mapIndex}`,
        },
      });
      const available = new Set(params.availableFiles);
      return (result.relevantFiles ?? [])
        .filter((file) => typeof file === 'string' && available.has(file))
        .slice(0, MAP_SELECTION_SIZE);
    } catch {
      return params.availableFiles.slice(0, MAP_SELECTION_SIZE);
    }
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      result.push(items.slice(index, index + size));
    }
    return result;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (next < items.length) {
          const index = next++;
          results[index] = await mapper(items[index], index);
        }
      },
    );
    await Promise.all(workers);
    return results;
  }

  private prioritizeFiles(
    requiredFiles: string[],
    hintedFiles: string[],
    sourceFiles: string[],
  ) {
    return Array.from(
      new Set([...requiredFiles, ...hintedFiles, ...sourceFiles]),
    ).slice(0, MAX_CONTEXT_FILES);
  }

  private async readFileContents(
    rootDir: string,
    relevantFiles: string[],
    failureFiles: Set<string>,
  ): Promise<Array<{ path: string; content: string }>> {
    const contents: Array<{ path: string; content: string }> = [];

    for (const path of relevantFiles.slice(0, MAX_CONTEXT_FILES)) {
      try {
        const raw = await this.workspace.readTextFile(
          this.workspace.resolveInside(rootDir, path),
        );
        contents.push({
          path,
          content: failureFiles.has(path)
            ? raw.slice(0, MAX_FAILURE_FILE_CONTENT_CHARS)
            : this.reduceFileContent(raw),
        });
      } catch {
        // File may not exist yet (e.g. it is about to be created) — skip.
      }
    }

    return contents;
  }

  private reduceFileContent(raw: string): string {
    if (raw.length <= MAX_FILE_CONTENT_CHARS) return raw;
    const half = Math.floor(MAX_FILE_CONTENT_CHARS / 2);
    return [
      raw.slice(0, half),
      '// ... middle omitted by context reducer ...',
      raw.slice(-half),
    ].join('\n');
  }

  private extractFailureFilePaths(failures: BuildRunResult[]): string[] {
    const paths = new Set<string>();
    for (const failure of failures) {
      if (failure.success || !failure.errorSummary) continue;
      // eslint-disable-next-line no-control-regex
      const clean = failure.errorSummary.replace(/\x1b\[[0-9;]*m/g, '');
      const regex = /(src\/[\w./-]+\.ts)(?=[:\s);]|$)/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(clean)) !== null) paths.add(match[1]);
    }
    return [...paths];
  }
}
