import { Injectable } from '@nestjs/common';
import { OpenAiJsonClient } from '../../builds/llm/openai-json.client';
import {
  FilePatch,
  FilePatchFailure,
  GeneratedFile,
} from '../../builds/types/build.types';
import { TestTargetAdapter } from '../targets/test-target-adapter';
import { CoverageGap, TestCodeContext, TestSpec } from '../types/test.types';

export interface TestGenerationOutput {
  files: GeneratedFile[];
  patches: FilePatch[];
  applicationPatches: FilePatch[];
  patchFailures: FilePatchFailure[];
  classification: 'BAD_TEST' | 'CODE_DEFECT';
  diagnosis?: string;
}

type RawTestGenerationOutput = {
  files?: GeneratedFile[];
  patches?: FilePatch[];
  applicationPatches?: FilePatch[];
  classification?: 'BAD_TEST' | 'CODE_DEFECT';
  diagnosis?: string;
};

const MAX_LLM_PATCH_RESPONSES = 3;

@Injectable()
export class TestCodeGenerationAgent {
  constructor(private readonly llm: OpenAiJsonClient) {}

  async generate(params: {
    appDir: string;
    spec: TestSpec;
    context: TestCodeContext;
    attempt: number;
    coverageGaps: CoverageGap[];
    adapter: TestTargetAdapter;
    workspaceId?: string;
    patchFailures?: FilePatchFailure[];
    targetFile?: string;
  }): Promise<TestGenerationOutput> {
    const harnessFiles = await params.adapter.harnessFiles(
      params.appDir,
      params.spec,
    );

    let retryFeedback: string | undefined;
    let lastOutput: TestGenerationOutput = {
      files: harnessFiles,
      patches: [],
      applicationPatches: [],
      patchFailures: [],
      classification: 'BAD_TEST',
    };

    for (
      let responseAttempt = 1;
      responseAttempt <= MAX_LLM_PATCH_RESPONSES;
      responseAttempt += 1
    ) {
      const result = await this.llm.generateJson<RawTestGenerationOutput>({
        model: this.llm.codeGenerationModel?.(),
        system: params.adapter.testGenerationSystemPrompt(),
        user: [
          params.adapter.testGenerationPrompt(params),
          ...(params.targetFile
            ? [
                '',
                `Current spec target: ${params.targetFile}`,
                'Generate or patch ONLY this exact test file. Do not return any other spec file.',
              ]
            : []),
          ...(retryFeedback ? ['', retryFeedback] : []),
        ].join('\n'),
        temperature: responseAttempt > 1 ? 0 : params.attempt > 1 ? 0.12 : 0.05,
        context: {
          workspaceId: params.workspaceId,
          caller: `test-code-gen:attempt-${params.attempt}:response-${responseAttempt}`,
        },
      });

      lastOutput = this.validateResponse(result, params, harnessFiles);
      const hasTargetOutput = this.hasUsableTargetOutput(
        lastOutput,
        params.targetFile,
      );
      if (hasTargetOutput || responseAttempt === MAX_LLM_PATCH_RESPONSES) {
        return lastOutput;
      }

      retryFeedback = this.retryFeedback(
        params.targetFile!,
        lastOutput.patchFailures,
      );
    }

    return lastOutput;
  }

  private validateResponse(
    result: RawTestGenerationOutput,
    params: {
      context: TestCodeContext;
      adapter: TestTargetAdapter;
      targetFile?: string;
    },
    harnessFiles: GeneratedFile[],
  ): TestGenerationOutput {
    const existingPaths = new Set(
      params.context.relevantFiles.map((file) => file.path),
    );
    const classification =
      result.classification === 'CODE_DEFECT' ? 'CODE_DEFECT' : 'BAD_TEST';
    const patchFailures: FilePatchFailure[] = [];
    const generatedFiles = params.adapter.normalizeTestFiles(
      (result.files ?? [])
        .filter((file) => file.path && typeof file.content === 'string')
        .filter((file) => {
          const accepted =
            params.adapter.isTestFile(file.path) &&
            (!params.targetFile || file.path === params.targetFile) &&
            !existingPaths.has(file.path);
          if (
            !accepted &&
            params.targetFile === file.path &&
            existingPaths.has(file.path)
          ) {
            patchFailures.push({
              path: file.path,
              reason:
                'existing specs must be repaired with a patch; full-file regeneration is forbidden',
            });
          }
          return accepted;
        }),
      params.context,
    );

    const patches: FilePatch[] = [];
    for (const patch of result.patches ?? []) {
      if (
        !patch ||
        typeof patch.path !== 'string' ||
        !params.adapter.isPatchablePath(patch.path) ||
        (params.targetFile && patch.path !== params.targetFile) ||
        !Array.isArray(patch.edits)
      ) {
        continue;
      }

      if (this.isNewSpecPath(patch.path, params.context)) {
        patchFailures.push({
          path: patch.path,
          reason:
            'file does not exist; a brand-new test spec must be returned as a complete file, not a patch',
        });
        continue;
      }

      const currentFile = params.context.relevantFiles.find(
        (file) => file.path === patch.path,
      );
      const preflightFailure = currentFile
        ? this.preflightPatch(patch, currentFile.content)
        : undefined;
      if (preflightFailure) {
        patchFailures.push({ path: patch.path, reason: preflightFailure });
        continue;
      }
      patches.push(patch);
    }

    const applicationPatches: FilePatch[] = [];
    for (const patch of result.applicationPatches ?? []) {
      if (
        classification !== 'CODE_DEFECT' ||
        !patch ||
        typeof patch.path !== 'string' ||
        !this.isApplicationPath(patch.path) ||
        !existingPaths.has(patch.path) ||
        !Array.isArray(patch.edits)
      ) {
        continue;
      }

      const currentFile = params.context.relevantFiles.find(
        (file) => file.path === patch.path,
      );
      const preflightFailure = currentFile
        ? this.preflightPatch(patch, currentFile.content)
        : 'application file is not present in the current code context';
      if (preflightFailure) {
        patchFailures.push({ path: patch.path, reason: preflightFailure });
        continue;
      }
      applicationPatches.push(patch);
    }

    if (classification === 'CODE_DEFECT' && applicationPatches.length === 0) {
      patchFailures.push({
        path: params.targetFile ?? 'application',
        reason:
          'classification was CODE_DEFECT but no valid applicationPatches were returned; repair the application implementation required by the specification',
      });
    }

    if (
      params.targetFile &&
      !generatedFiles.some((file) => file.path === params.targetFile) &&
      !patches.some((patch) => patch.path === params.targetFile) &&
      applicationPatches.length === 0 &&
      patchFailures.length === 0
    ) {
      patchFailures.push({
        path: params.targetFile,
        reason:
          'the response did not contain a usable file or patch for the current target',
      });
    }

    return {
      files: [...harnessFiles, ...generatedFiles],
      patches,
      applicationPatches,
      patchFailures,
      classification,
      ...(typeof result.diagnosis === 'string' && result.diagnosis.trim()
        ? { diagnosis: result.diagnosis.trim() }
        : {}),
    };
  }

  private hasUsableTargetOutput(
    output: TestGenerationOutput,
    targetFile?: string,
  ): boolean {
    if (!targetFile) return true;
    if (output.classification === 'CODE_DEFECT') {
      return output.applicationPatches.length > 0;
    }
    return (
      output.files.some((file) => file.path === targetFile) ||
      output.patches.some((patch) => patch.path === targetFile)
    );
  }

  private preflightPatch(
    patch: FilePatch,
    original: string,
  ): string | undefined {
    const edits = (patch.edits ?? []).filter(
      (edit) =>
        edit &&
        typeof edit.find === 'string' &&
        edit.find.length > 0 &&
        typeof edit.replace === 'string',
    );
    if (edits.length === 0) return 'patch had no valid edits';

    let content = original;
    for (const edit of edits) {
      const occurrences = content.split(edit.find).length - 1;
      if (occurrences === 0) {
        return `find text is not present in the current spec: ${this.preview(edit.find)}`;
      }
      if (occurrences > 1) {
        return [
          `find text is ambiguous (${occurrences} matches): ${this.preview(edit.find)}`,
          'The rejected find and exact matching neighborhoods are shown below. Return a NEW patch with a longer find copied verbatim from one complete describe/it block.',
          'If the repair removes adjacent duplicate statements, put BOTH duplicate statements in find and one statement in replace.',
          this.occurrenceContexts(content, edit.find),
        ].join('\n');
      }
      content = content.replace(edit.find, () => edit.replace);
    }
    return undefined;
  }

  private occurrenceContexts(content: string, find: string): string {
    const lines = content.split('\n');
    const contexts: string[] = [];
    let offset = 0;
    let occurrence = 1;
    while (contexts.length < 4) {
      const index = content.indexOf(find, offset);
      if (index < 0) break;
      const line = content.slice(0, index).split('\n').length - 1;
      const start = Math.max(0, line - 2);
      const end = Math.min(lines.length, line + 4);
      contexts.push(
        [
          `Match ${occurrence} around line ${line + 1}:`,
          ...lines
            .slice(start, end)
            .map((value, lineIndex) => `${start + lineIndex + 1}: ${value}`),
        ].join('\n'),
      );
      occurrence += 1;
      offset = index + Math.max(find.length, 1);
    }
    return contexts.join('\n---\n');
  }

  private retryFeedback(
    targetFile: string,
    failures: FilePatchFailure[],
  ): string {
    return [
      '=== YOUR PREVIOUS RESPONSE WAS REJECTED BEFORE APPLY ===',
      `Target: ${targetFile}`,
      ...failures.map((failure) => failure.reason),
      'Return corrected JSON for this target only. Do not repeat the rejected find text.',
    ].join('\n');
  }

  private preview(value: string): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 120
      ? `${normalized.slice(0, 120)}…`
      : normalized;
  }

  private isNewSpecPath(path: string, context: TestCodeContext): boolean {
    const paths = new Set(context.relevantFiles.map((file) => file.path));
    const sourcePath = path.replace(/\.spec\.ts$/, '.ts');
    return paths.has(sourcePath) && !paths.has(path);
  }

  private isApplicationPath(path: string): boolean {
    return (
      path.startsWith('src/') &&
      path.endsWith('.ts') &&
      !path.endsWith('.spec.ts')
    );
  }
}
