import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { OpenAiJsonClient } from '../llm/openai-json.client';
import { TargetAdapter } from '../targets/target-adapter';
import { buildRepairDiagnostics } from '../repair/repair-diagnostics';
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
    const repairMode = params.context.previousFailures.some(
      (failure) => !failure.success,
    );
    const repairDiagnostics = repairMode
      ? buildRepairDiagnostics(
          params.context.previousFailures,
          params.context.fileContents,
        )
      : [];
    let lastProblem = '';
    let lastCandidateFiles: GeneratedFile[] = [];

    for (let attempt = 1; attempt <= MAX_LLM_ATTEMPTS; attempt += 1) {
      try {
        const result = await this.llm.generateJson<{ files: GeneratedFile[] }>({
          model: this.llm.codeGenerationModel?.(),
          system: repairMode
            ? 'You are repairing a backend task after a verified compile or runtime failure. The failure evidence is authoritative. Return JSON only. Every file must include path and complete content.'
            : 'You are a careful backend task execution agent. Return JSON only. Every file must include path and complete content.',
          user: [
            ...(repairMode
              ? [
                  'REPAIR MODE: Fix the verified failure before making any other improvement.',
                  'The structured diagnostics below are authoritative and ordered. Start at the reported file, line, symbol, and excerpt; do not search the entire codebase for a different explanation.',
                  'For every diagnostic, implement its expectedFix and preserve unrelated code that already passes.',
                  'STRUCTURED REPAIR DIAGNOSTICS:',
                  JSON.stringify(repairDiagnostics, null, 2),
                  '',
                  'RAW VERIFICATION LOG (evidence appendix only):',
                  JSON.stringify(params.context.previousFailures, null, 2),
                  '',
                ]
              : []),
            ...(lastProblem
              ? [
                  'PREVIOUS CANDIDATE REJECTION DIAGNOSTICS:',
                  JSON.stringify(
                    buildRepairDiagnostics(
                      lastProblem,
                      lastCandidateFiles.length > 0
                        ? lastCandidateFiles
                        : params.context.fileContents,
                    ),
                    null,
                    2,
                  ),
                  `Raw rejection: ${lastProblem}`,
                  'Address every expectedFix explicitly in the replacement files.',
                  '',
                ]
              : []),
            params.adapter.taskGenerationPrompt(params),
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
        const normalizedScopedFiles =
          params.adapter.normalizeGeneratedFiles(scopedFiles);
        const effectiveFiles = repairMode
          ? this.mergeRepairCandidate(
              params.context.fileContents,
              normalizedScopedFiles,
              allowedFiles,
            )
          : normalizedScopedFiles;
        lastCandidateFiles = effectiveFiles;

        const returnedPaths = new Set(effectiveFiles.map((file) => file.path));
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
            files: effectiveFiles,
          }) ?? [];

        const candidateIsStructurallyValid =
          scopedFiles.length > 0 &&
          missingRequired.length === 0 &&
          alteredUserBlocks.length === 0 &&
          contractProblems.length === 0;

        if (candidateIsStructurallyValid) {
          const requiresIndependentReview =
            repairMode ||
            params.adapter.requiresIndependentTaskReview?.(params.task) ===
              true;
          const reviewProblems = requiresIndependentReview
            ? await this.reviewTaskCandidate({
                spec: params.spec,
                task: params.task,
                context: params.context,
                files: effectiveFiles,
                workspaceId: params.workspaceId,
                repairMode,
              })
            : [];
          if (reviewProblems.length === 0) {
            return normalizedScopedFiles;
          }
          lastProblem = `independent task review failed (${reviewProblems.join('; ')})`;
          continue;
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

  private mergeRepairCandidate(
    currentFiles: GeneratedFile[],
    proposedFiles: GeneratedFile[],
    allowedFiles: Set<string>,
  ): GeneratedFile[] {
    const merged = new Map(
      currentFiles
        .filter(
          (file) => allowedFiles.size === 0 || allowedFiles.has(file.path),
        )
        .map((file) => [file.path, file]),
    );
    for (const file of proposedFiles) {
      merged.set(file.path, file);
    }
    return [...merged.values()];
  }

  private async reviewTaskCandidate(params: {
    spec: AppSpec;
    task: BuildTask;
    context: CodeContext;
    files: GeneratedFile[];
    workspaceId?: string;
    repairMode: boolean;
  }): Promise<string[]> {
    try {
      const result = await this.llm.generateJson<{
        approved: boolean;
        problems?: string[];
      }>({
        model: this.llm.codeGenerationModel?.(),
        system:
          'You are an independent backend contract reviewer, separate from the code generator. Decide whether proposed complete replacement files satisfy the task, normalized application spec, and any verified failures. Return JSON only with shape {"approved":boolean,"problems":string[]}.',
        user: [
          params.repairMode
            ? 'Review the repair candidate against every verified failure.'
            : 'Review this first-pass candidate before it is written or executed.',
          'Cross-check entity fields and types, required create inputs, DTO runtime transformations, relation existence/404 behavior, Nest module provider visibility, database constraints and reversible migrations, route behavior, and response/OpenAPI schemas that are in this task scope.',
          'Reject changes that merely compile but leave the reported runtime dependency, metadata, route, database, or bootstrap failure possible.',
          'Use the exact failing token and its owning module/file context. For Nest unknown-dependency errors, compare provider constructor injections with providers/imports/exports and TypeOrmModule.forFeature registrations in that same feature module; AppModule visibility is not sufficient.',
          'Problems must be concrete edit instructions referencing candidate file paths and missing symbols. Return approved=true only when no problem remains.',
          '',
          'Task:',
          JSON.stringify(params.task, null, 2),
          '',
          'Normalized application specification:',
          JSON.stringify(params.spec, null, 2),
          '',
          'Structured verified failure diagnostics (authoritative):',
          JSON.stringify(
            buildRepairDiagnostics(
              params.context.previousFailures,
              params.context.fileContents,
            ),
            null,
            2,
          ),
          '',
          'Raw verified failures (evidence appendix):',
          JSON.stringify(params.context.previousFailures, null, 2),
          '',
          'Current relevant files before repair:',
          JSON.stringify(params.context.fileContents, null, 2),
          '',
          'Proposed complete replacement files:',
          JSON.stringify(params.files, null, 2),
        ].join('\n'),
        temperature: 0,
        context: {
          workspaceId: params.workspaceId,
          caller: `code-gen:independent-review:${params.task.id}`,
        },
      });

      if (result?.approved === true) {
        return [];
      }
      const problems = Array.isArray(result?.problems)
        ? result.problems.filter(
            (problem): problem is string =>
              typeof problem === 'string' && problem.trim().length > 0,
          )
        : [];
      return problems.length > 0
        ? problems
        : ['reviewer did not approve the repair or explain why'];
    } catch (error) {
      // Runtime verification remains the final authority. If the reviewer call
      // itself is unavailable, do not discard an otherwise valid candidate.
      console.error(
        `[CodeGeneration] independent review failed for ${params.task.id}:`,
        (error as Error)?.message ?? error,
      );
      return [];
    }
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
