import { BadRequestException, Injectable } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import path from 'node:path';
import { TestRequestDto } from '../dto/test-request.dto';
import {
  CoverageGap,
  NormalizedTestRequest,
  TestCodeContext,
  TestProgressEvent,
  TestResponse,
  TestRunResult,
  TestSpec,
} from '../types/test.types';
import { TestTargetAdapterRegistry } from '../targets/test-target-adapter.registry';
import {
  BuildRunResult,
  FilePatch,
  FilePatchFailure,
  GeneratedFile,
  TargetFramework,
} from '../../builds/types/build.types';
import { WorkspaceWriter } from '../../builds/runtime/workspace-writer';
import { CodePatchTool } from '../../tools/code-patch.tool';
import { EndpointSpecUnderstandingAgent } from '../agents/endpoint-spec-understanding.agent';
import { TestCodebaseSearchAgent } from '../agents/test-codebase-search.agent';
import { TestCodeGenerationAgent } from '../agents/test-code-generation.agent';
import { TestExecutionAgent } from '../agents/test-execution.agent';

const TestState = Annotation.Root({
  request: Annotation<NormalizedTestRequest>(),
  spec: Annotation<TestSpec | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  context: Annotation<TestCodeContext | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  currentGeneratedFiles: Annotation<GeneratedFile[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  currentPatches: Annotation<FilePatch[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  generatedFiles: Annotation<GeneratedFile[]>({
    reducer: (current, update) => {
      const byPath = new Map(current.map((file) => [file.path, file]));
      for (const file of update) {
        byPath.set(file.path, file);
      }
      return Array.from(byPath.values()).sort((a, b) =>
        a.path.localeCompare(b.path),
      );
    },
    default: () => [],
  }),
  changedFiles: Annotation<string[]>({
    reducer: (current, update) =>
      Array.from(new Set([...current, ...update])).sort(),
    default: () => [],
  }),
  testResult: Annotation<TestRunResult | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  // Only the latest failure is relevant; accumulating every attempt's full
  // runner output buries the actionable error in noise.
  failures: Annotation<BuildRunResult[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  // Patches from the last attempt that could not be applied, surfaced to the
  // next generation so the model resends them.
  patchFailures: Annotation<FilePatchFailure[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  attempts: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  testRuns: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  dependenciesReady: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
  coverageGaps: Annotation<CoverageGap[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  targetValidationFailed: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
});

type TestStateType = typeof TestState.State;

const TEST_GRAPH_RECURSION_LIMIT = 120;
// The model converges incrementally (each retry fixes a subset of failures), so
// a slightly higher default than 3 meaningfully raises the fully-green rate.
const DEFAULT_TEST_ATTEMPTS = 20;
const MAX_TEST_ATTEMPTS = 20;

@Injectable()
export class ApplicationTestGraph {
  constructor(
    private readonly workspace: WorkspaceWriter,
    private readonly codePatchTool: CodePatchTool,
    private readonly endpointSpecAgent: EndpointSpecUnderstandingAgent,
    private readonly codebaseSearchAgent: TestCodebaseSearchAgent,
    private readonly testGenerationAgent: TestCodeGenerationAgent,
    private readonly testExecutionAgent: TestExecutionAgent,
    private readonly testAdapters: TestTargetAdapterRegistry,
  ) {}

  async run(
    dto: TestRequestDto,
    onProgress?: (event: TestProgressEvent) => void,
  ): Promise<TestResponse> {
    const request = this.normalizeRequest(dto);
    const graph = new StateGraph(TestState)
      .addNode(
        'understandEndpointSpec',
        this.withProgress(
          'Understanding endpoint/function specifications',
          this.understandEndpointSpec.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'searchCodebase',
        this.withProgress(
          'Searching generated NestJS codebase',
          this.searchCodebase.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'generateTestCode',
        (state) => this.generateTestsSequentially(state, onProgress),
      )
      .addNode(
        'runCoverageAndTests',
        this.withProgress(
          'Running test coverage and verification',
          this.runCoverageAndTests.bind(this),
          onProgress,
        ),
      )
      .addEdge(START, 'understandEndpointSpec')
      .addEdge('understandEndpointSpec', 'searchCodebase')
      .addEdge('searchCodebase', 'generateTestCode')
      .addConditionalEdges(
        'generateTestCode',
        (state) => this.nextAfterTargetTests(state),
        {
          searchCodebase: 'searchCodebase',
          runCoverageAndTests: 'runCoverageAndTests',
          done: END,
        },
      )
      .addConditionalEdges(
        'runCoverageAndTests',
        (state) => this.nextAfterTests(state),
        {
          searchCodebase: 'searchCodebase',
          done: END,
        },
      )
      .compile();

    const finalState = await graph.invoke(
      { request },
      { recursionLimit: TEST_GRAPH_RECURSION_LIMIT },
    );

    if (!finalState.spec || !finalState.testResult) {
      throw new BadRequestException(
        'Test graph finished without required state',
      );
    }

    onProgress?.({
      stage: finalState.testResult.success ? 'completed' : 'failed',
      message: finalState.testResult.success
        ? 'NestJS test verification completed'
        : 'NestJS test verification failed',
      detail: {
        appDir: request.appDir,
        attempts: finalState.attempts,
        testRuns: finalState.testRuns,
        success: finalState.testResult.success,
      },
    });

    return {
      target: request.target,
      appDir: request.appDir,
      projectDir: request.projectDir,
      spec: finalState.spec,
      generatedFiles: finalState.generatedFiles,
      changedFiles: finalState.changedFiles,
      test: finalState.testResult,
      attempts: finalState.attempts,
      testRuns: finalState.testRuns,
      verified: finalState.testResult.success,
    };
  }

  private withProgress(
    message: string,
    node: (state: TestStateType) => Promise<Partial<TestStateType>>,
    onProgress?: (event: TestProgressEvent) => void,
  ) {
    return async (state: TestStateType) => {
      const detail = {
        attempt: this.progressAttempt(state, message),
        ...this.testGenerationTargetProgress(message, state),
      };
      onProgress?.({ stage: 'started', message, detail });
      const startedAt = Date.now();
      const progressHeartbeat = onProgress
        ? setInterval(() => {
            onProgress({
              stage: 'started',
              message,
              detail: {
                ...detail,
                heartbeat: true,
                elapsedSeconds: Math.max(
                  1,
                  Math.round((Date.now() - startedAt) / 1000),
                ),
              },
            });
          }, 15_000)
        : undefined;
      progressHeartbeat?.unref();
      try {
        const result = await node(state);
        if (progressHeartbeat) clearInterval(progressHeartbeat);
        const failed = result.testResult?.success === false;
        onProgress?.({
          stage: failed ? 'failed' : 'completed',
          message,
          detail: failed
            ? { ...detail, error: result.testResult?.errorSummary }
            : { ...detail, ...this.generatedTestProgress(message, result) },
        });
        return result;
      } catch (error) {
        if (progressHeartbeat) clearInterval(progressHeartbeat);
        onProgress?.({
          stage: 'failed',
          message,
          detail: {
            ...detail,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
        throw error;
      }
    };
  }

  private progressAttempt(state: TestStateType, message: string): number {
    // Generation increments attempts before patching and running the suite.
    // Search/generation therefore describe the next attempt, while later
    // nodes describe the attempt already in progress.
    if (
      message === 'Applying generated test files' ||
      message === 'Running test coverage and verification'
    ) {
      return Math.max(state.attempts, 1);
    }

    return state.attempts + 1;
  }

  private generatedTestProgress(
    message: string,
    result: Partial<TestStateType>,
  ): Record<string, unknown> {
    if (message !== 'Generating framework test code') {
      return {};
    }

    return {
      generatedTests: (result.generatedFiles ?? []).map((file) => ({
        path: file.path,
        cases: Array.from(
          file.content.matchAll(/\b(?:describe|it|test)\s*\(\s*(['"`])([^\n]*?)\1/g),
          (match) => match[2].trim(),
        ).filter(Boolean).slice(0, 20),
      })),
      patchedTestFiles: (result.currentPatches ?? []).map((patch) => patch.path),
    };
  }

  private testGenerationTargetProgress(
    message: string,
    state: TestStateType,
  ): Record<string, unknown> {
    if (message !== 'Generating framework test code' || !state.context) {
      return {};
    }

    return {
      plannedTestFiles: this.testGenerationTargets(state),
    };
  }

  private testGenerationTargets(state: TestStateType): string[] {
    if (!state.context) return [];
    const failedSpecs = state.context.failedSpecPaths.filter((filePath) =>
      filePath.endsWith('.spec.ts'),
    );
    const plannedTestFiles =
      failedSpecs.length > 0
        ? failedSpecs
        : state.context.relevantFiles
            .map((file) => file.path)
            .filter(
              (filePath) =>
                !filePath.endsWith('.spec.ts') &&
                /\.(?:controller|service)\.ts$/.test(filePath),
            )
            .map((filePath) => filePath.replace(/\.ts$/, '.spec.ts'));
    return Array.from(new Set(plannedTestFiles)).sort().slice(0, 40);
  }

  private normalizeRequest(dto: TestRequestDto): NormalizedTestRequest {
    if (!dto.appDir) {
      throw new BadRequestException('appDir is required');
    }

    const appDir = this.workspace.resolveProjectDir(dto.appDir);
    const projectDir = dto.projectDir
      ? this.workspace.resolveProjectDir(dto.projectDir)
      : path.dirname(appDir);

    const workspaceId = dto.workspaceId ?? this.extractWorkspaceId(appDir);

    return {
      target: dto.target ?? TargetFramework.NestJS,
      appDir,
      projectDir,
      maxAttempts: Math.min(
        Math.max(dto.maxAttempts ?? DEFAULT_TEST_ATTEMPTS, 1),
        MAX_TEST_ATTEMPTS,
      ),
      workspaceId,
    };
  }

  private extractWorkspaceId(appDir: string): string | undefined {
    const match = appDir.match(/workspaces\/([0-9a-f-]{36})/i);
    return match?.[1];
  }

  private async understandEndpointSpec(
    state: TestStateType,
  ): Promise<Partial<TestStateType>> {
    return {
      spec: await this.endpointSpecAgent.understand(state.request.projectDir),
    };
  }

  private async searchCodebase(
    state: TestStateType,
  ): Promise<Partial<TestStateType>> {
    if (!state.spec) {
      throw new BadRequestException(
        'Cannot search codebase without endpoint specification',
      );
    }

    return {
      context: await this.codebaseSearchAgent.search({
        appDir: state.request.appDir,
        spec: state.spec,
        previousFailures: state.failures,
      }),
    };
  }

  private async generateTestsSequentially(
    state: TestStateType,
    onProgress?: (event: TestProgressEvent) => void,
  ): Promise<Partial<TestStateType>> {
    if (!state.spec || !state.context) {
      throw new BadRequestException(
        'Cannot generate tests without specification and code context',
      );
    }

    const adapter = this.testAdapters.get(state.request.target);
    const targets = this.testGenerationTargets(state);
    const round = state.attempts + 1;
    let dependenciesReady = state.dependenciesReady;
    let testRuns = state.testRuns;
    const generatedFiles: GeneratedFile[] = [];
    const changedFiles: string[] = [];
    const patchFailures: FilePatchFailure[] = [];
    const failedResults: Array<{ target: string; result: TestRunResult }> = [];
    const commands: TestRunResult['commands'] = [];

    for (const [index, targetFile] of targets.entries()) {
      const detail = {
        attempt: round,
        targetFile,
        targetIndex: index + 1,
        targetTotal: targets.length,
      };

      let output: Awaited<ReturnType<TestCodeGenerationAgent['generate']>>;
      try {
        output = await this.runProgressPhase(
          'Generating individual Jest test',
          detail,
          () =>
            this.testGenerationAgent.generate({
              appDir: state.request.appDir,
              spec: state.spec!,
              context: state.context!,
              attempt: round,
              coverageGaps: state.coverageGaps,
              adapter,
              workspaceId: state.request.workspaceId,
              patchFailures: state.patchFailures,
              targetFile,
            }),
          onProgress,
        );
      } catch (error) {
        failedResults.push({
          target: targetFile,
          result: {
            success: false,
            commands: [],
            errorSummary: `${targetFile}: ${error instanceof Error ? error.message : 'Test generation failed'}`,
          },
        });
        continue;
      }

      const targetSpecs = output.files.filter(
        (file) => adapter.isTestFile(file.path) && file.path === targetFile,
      );
      const targetPatches = output.patches.filter(
        (patch) => patch.path === targetFile,
      );
      if (targetSpecs.length === 0 && targetPatches.length === 0) {
        const errorSummary = `${targetFile}: the test generator returned no file or patch for the selected target`;
        onProgress?.({
          stage: 'failed',
          message: 'Generating individual Jest test',
          detail: { ...detail, error: errorSummary },
        });
        failedResults.push({
          target: targetFile,
          result: { success: false, commands: [], errorSummary },
        });
        continue;
      }

      onProgress?.({
        stage: 'completed',
        message: 'Generating individual Jest test details',
        detail: {
          ...detail,
          ...this.generatedTestProgress('Generating framework test code', {
            generatedFiles: targetSpecs,
            currentPatches: targetPatches,
          }),
        },
      });

      await this.runProgressPhase(
        'Applying individual Jest test',
        detail,
        async () => {
          const replaced = await this.codePatchTool.applyPlainFileReplacements(
            state.request.appDir,
            output.files,
          );
          const patched = await this.codePatchTool.applyEditPatches(
            state.request.appDir,
            targetPatches,
            adapter.validatePatchedSyntax?.bind(adapter),
          );
          changedFiles.push(...replaced, ...patched.applied);
          patchFailures.push(...patched.failures);
          return {};
        },
        onProgress,
      );
      generatedFiles.push(...targetSpecs);

      onProgress?.({
        stage: 'started',
        message: 'Verifying individual Jest test',
        detail,
      });
      const includeSetup = !dependenciesReady;
      const result = await this.testExecutionAgent.run(
        state.request.appDir,
        adapter,
        { includeSetup, targetFile },
      );
      commands.push(...result.commands);
      const setupCommandCount = includeSetup ? adapter.setupCommands().length : 0;
      dependenciesReady =
        dependenciesReady ||
        (includeSetup &&
          (setupCommandCount === 0 ||
            result.commands
              .slice(0, setupCommandCount)
              .every((command) => command.success)));
      if (result.commands.length > setupCommandCount) testRuns += 1;

      onProgress?.({
        stage: result.success ? 'completed' : 'failed',
        message: 'Verifying individual Jest test',
        detail: result.success
          ? detail
          : { ...detail, error: result.errorSummary },
      });
      if (!result.success) failedResults.push({ target: targetFile, result });
    }

    const success = failedResults.length === 0;
    const testResult: TestRunResult = {
      success,
      commands,
      errorSummary: success
        ? undefined
        : failedResults
            .map(
              ({ target, result }) =>
                `FAIL ${target}\n${result.errorSummary ?? 'Unknown targeted test failure'}`,
            )
            .join('\n\n'),
      testsPassed: success ? targets.length : targets.length - failedResults.length,
      testsFailed: failedResults.length,
      testsTotal: targets.length,
    };

    return {
      generatedFiles,
      changedFiles,
      patchFailures,
      attempts: round,
      testRuns,
      dependenciesReady,
      testResult,
      failures: success ? [] : [testResult],
      targetValidationFailed: !success,
    };
  }

  private async runProgressPhase<T>(
    message: string,
    detail: Record<string, unknown>,
    task: () => Promise<T>,
    onProgress?: (event: TestProgressEvent) => void,
  ): Promise<T> {
    onProgress?.({ stage: 'started', message, detail });
    const startedAt = Date.now();
    const heartbeat = onProgress
      ? setInterval(() => {
          onProgress({
            stage: 'started',
            message,
            detail: {
              ...detail,
              heartbeat: true,
              elapsedSeconds: Math.max(
                1,
                Math.round((Date.now() - startedAt) / 1000),
              ),
            },
          });
        }, 15_000)
      : undefined;
    heartbeat?.unref();
    try {
      const result = await task();
      if (heartbeat) clearInterval(heartbeat);
      onProgress?.({ stage: 'completed', message, detail });
      return result;
    } catch (error) {
      if (heartbeat) clearInterval(heartbeat);
      onProgress?.({
        stage: 'failed',
        message,
        detail: {
          ...detail,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  private async generateTestCode(
    state: TestStateType,
  ): Promise<Partial<TestStateType>> {
    if (!state.spec || !state.context) {
      throw new BadRequestException(
        'Cannot generate tests without specification and code context',
      );
    }

    const adapter = this.testAdapters.get(state.request.target);
    const { files, patches } = await this.testGenerationAgent.generate({
      appDir: state.request.appDir,
      spec: state.spec,
      context: state.context,
      attempt: state.attempts + 1,
      coverageGaps: state.coverageGaps,
      adapter,
      workspaceId: state.request.workspaceId,
      patchFailures: state.patchFailures,
    });

    return {
      currentGeneratedFiles: files,
      currentPatches: patches,
      generatedFiles: files.filter((file) => adapter.isTestFile(file.path)),
      attempts: state.attempts + 1,
    };
  }

  private async applyPatch(
    state: TestStateType,
  ): Promise<Partial<TestStateType>> {
    // Full files (new specs + harness) first, then targeted patches on top of
    // the existing spec files the model chose not to rewrite.
    const replacedFiles = await this.codePatchTool.applyPlainFileReplacements(
      state.request.appDir,
      state.currentGeneratedFiles,
    );

    const adapter = this.testAdapters.get(state.request.target);
    const { applied, failures } = await this.codePatchTool.applyEditPatches(
      state.request.appDir,
      state.currentPatches,
      // Reject any patch whose result would not parse, so a malformed test edit
      // is retried instead of corrupting a spec and failing the whole suite.
      adapter.validatePatchedSyntax?.bind(adapter),
    );

    return {
      changedFiles: Array.from(new Set([...replacedFiles, ...applied])).sort(),
      patchFailures: failures,
    };
  }

  private async runCoverageAndTests(
    state: TestStateType,
  ): Promise<Partial<TestStateType>> {
    const adapter = this.testAdapters.get(state.request.target);
    const includeSetup = !state.dependenciesReady;
    let testResult = await this.testExecutionAgent.run(
      state.request.appDir,
      adapter,
      { includeSetup },
    );
    let repairedFiles: string[] = [];
    const setupCommandCount = includeSetup ? adapter.setupCommands().length : 0;
    let testRuns =
      state.testRuns + (testResult.commands.length > setupCommandCount ? 1 : 0);
    const dependenciesReady =
      state.dependenciesReady ||
      (includeSetup &&
        (setupCommandCount === 0 ||
          testResult.commands
            .slice(0, setupCommandCount)
            .every((command) => command.success)));

    if (!testResult.success && testResult.errorSummary) {
      const repairs = await adapter.repairGeneratedTests?.({
        appDir: state.request.appDir,
        errorSummary: testResult.errorSummary,
        workspace: this.workspace,
        context: state.context,
      });

      if (repairs && repairs.length > 0) {
        await this.workspace.writeFiles(state.request.appDir, repairs);
        repairedFiles = repairs.map((file) => file.path).sort();
        testResult = await this.testExecutionAgent.run(
          state.request.appDir,
          adapter,
        );
        testRuns += 1;
      }
    }

    return {
      testResult,
      coverageGaps: testResult.coverageGaps ?? [],
      failures: testResult.success ? [] : [testResult],
      changedFiles: repairedFiles,
      testRuns,
      dependenciesReady,
    };
  }

  private nextAfterTests(state: TestStateType) {
    if (state.testResult?.success) {
      return 'done';
    }

    return state.attempts < state.request.maxAttempts
      ? 'searchCodebase'
      : 'done';
  }

  private nextAfterTargetTests(
    state: TestStateType,
  ): 'searchCodebase' | 'runCoverageAndTests' | 'done' {
    if (!state.targetValidationFailed) {
      return 'runCoverageAndTests';
    }
    return state.attempts < state.request.maxAttempts
      ? 'searchCodebase'
      : 'done';
  }
}
