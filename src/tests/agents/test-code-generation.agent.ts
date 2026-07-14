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
}

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
  }): Promise<TestGenerationOutput> {
    const harnessFiles = await params.adapter.harnessFiles(params.appDir);

    const result = await this.llm.generateJson<{
      files?: GeneratedFile[];
      patches?: FilePatch[];
    }>({
      system: params.adapter.testGenerationSystemPrompt(),
      user: params.adapter.testGenerationPrompt(params),
      temperature: params.attempt > 1 ? 0.12 : 0.05,
      context: {
        workspaceId: params.workspaceId,
        caller: `test-code-gen:attempt-${params.attempt}`,
      },
    });

    // Full-file replacements are restricted to test specs. Application source
    // is never accepted from this agent, either as a file or as a patch.
    const generatedFiles = params.adapter.normalizeTestFiles(
      (result.files ?? [])
        .filter((file) => file.path && typeof file.content === 'string')
        .filter(
          (file) =>
            params.adapter.isTestFile(file.path) &&
            (!params.context.relevantFiles.some(
              (existing) => existing.path === file.path,
            ) ||
              params.context.failedSpecPaths.includes(file.path)),
        ),
      params.context,
    );

    // Test generation is observational: patches may only touch test files.
    // Product-code defects must remain visible as failing tests and must not be
    // silently repaired by the test agent.
    const patches = (result.patches ?? []).filter(
      (patch) =>
        patch &&
        typeof patch.path === 'string' &&
        params.adapter.isPatchablePath(patch.path) &&
        Array.isArray(patch.edits),
    );

    return {
      files: [...harnessFiles, ...generatedFiles],
      patches,
    };
  }
}
