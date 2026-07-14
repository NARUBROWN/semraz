import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { OpenAiJsonClient } from '../llm/openai-json.client';
import { TargetAdapter } from '../targets/target-adapter';
import {
  AppSpec,
  BuildTask,
  CodeContext,
  GeneratedFile,
} from '../types/build.types';

const MAX_LLM_ATTEMPTS = 3;

@Injectable()
export class CodeGenerationAgent {
  constructor(private readonly llm: OpenAiJsonClient) {}

  async generateTaskFiles(params: {
    spec: AppSpec;
    task: BuildTask;
    context: CodeContext;
    adapter: TargetAdapter;
    workspaceId?: string;
  }): Promise<GeneratedFile[]> {
    const allowedFiles = new Set(params.task.allowedFiles);
    const requiredFiles = new Set(
      params.adapter.requiredTaskFiles(params.task),
    );
    let lastProblem = '';

    for (let attempt = 1; attempt <= MAX_LLM_ATTEMPTS; attempt += 1) {
      try {
        const result = await this.llm.generateJson<{ files: GeneratedFile[] }>({
          system:
            'You are a careful backend task execution agent. Return JSON only. Every file must include path and complete content.',
          user: [
            params.adapter.taskGenerationPrompt(params),
            ...(lastProblem
              ? [
                  '',
                  `Your previous response was rejected: ${lastProblem}`,
                  'Return files whose paths exactly match currentTask.allowedFiles.',
                ]
              : []),
          ].join('\n'),
          temperature: attempt > 1 ? 0.15 : 0.08,
          context: {
            workspaceId: params.workspaceId,
            caller: `code-gen:task:${params.task.id}`,
          },
        });

        const files = (result.files ?? []).filter(
          (file) => file.path && typeof file.content === 'string',
        );
        const scopedFiles =
          allowedFiles.size > 0
            ? files.filter((file) => allowedFiles.has(file.path))
            : files;

        const returnedPaths = new Set(scopedFiles.map((file) => file.path));
        const missingRequired = [...requiredFiles].filter(
          (filePath) => !returnedPaths.has(filePath),
        );
        const alteredUserBlocks = scopedFiles.flatMap((file) => {
          const existing = params.context.fileContents.find(
            (candidate) => candidate.path === file.path,
          )?.content;
          return existing &&
            !this.preservesUserCodeBlocks(existing, file.content)
            ? [file.path]
            : [];
        });
        const contractProblems =
          params.adapter.validateTaskFiles?.({
            spec: params.spec,
            task: params.task,
            files: scopedFiles,
          }) ?? [];

        if (
          scopedFiles.length > 0 &&
          missingRequired.length === 0 &&
          alteredUserBlocks.length === 0 &&
          contractProblems.length === 0
        ) {
          return params.adapter.normalizeGeneratedFiles(scopedFiles);
        }

        lastProblem =
          contractProblems.length > 0
            ? `task contract validation failed (${contractProblems.join('; ')})`
            : alteredUserBlocks.length > 0
              ? `user-owned code blocks were removed or changed (${alteredUserBlocks.join(', ')})`
              : missingRequired.length > 0
                ? `required task files were missing (${missingRequired.join(', ')})`
                : files.length > 0
                  ? `every returned path was outside allowedFiles (${files
                      .map((file) => file.path)
                      .join(', ')})`
                  : 'no files were returned';
      } catch (error) {
        lastProblem = (error as Error)?.message ?? 'LLM call failed';
        console.error(
          `[CodeGeneration] attempt ${attempt} failed for ${params.task.id}:`,
          lastProblem,
        );
        // Ride out transient network blips before the next attempt.
        await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
      }
    }

    throw new InternalServerErrorException(
      `LLM code generation produced no usable files for task ${params.task.id}: ${lastProblem}`,
    );
  }

  private preservesUserCodeBlocks(existing: string, generated: string) {
    const blocks = Array.from(
      existing.matchAll(
        /\/\/\s*<semraz:user-code(?:\s+name="[^"]+")?>[\s\S]*?\/\/\s*<\/semraz:user-code>/g,
      ),
      (match) => match[0],
    );
    return blocks.every((block) => generated.includes(block));
  }
}
