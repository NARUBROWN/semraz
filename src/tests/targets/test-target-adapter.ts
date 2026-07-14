import {
  CommandSpec,
  FilePatchFailure,
  GeneratedFile,
  TargetFramework,
} from '../../builds/types/build.types';
import { WorkspaceWriter } from '../../builds/runtime/workspace-writer';
import { CoverageGap, TestCodeContext, TestSpec } from '../types/test.types';

/**
 * Framework-specific test strategy. Mirrors the build-side TargetAdapter so
 * additional frameworks (Spring, Express, ...) only need a new adapter.
 */
export interface TestTargetAdapter {
  readonly target: TargetFramework;

  /** Harness files (test runner config, scripts, dev deps) to write before generation. */
  harnessFiles(appDir: string): Promise<GeneratedFile[]>;

  /** Whether a generated file path is a test file this adapter accepts. */
  isTestFile(path: string): boolean;

  /** Whether a generated patch may modify this path. Must be test-only. */
  isPatchablePath(path: string): boolean;

  /** Rewrite known-broken generated test patterns into working equivalents. */
  normalizeTestFiles(
    files: GeneratedFile[],
    context?: TestCodeContext,
  ): GeneratedFile[];

  /**
   * Reject a patch whose RESULT would not parse. Returns a short error string
   * when `content` has a syntax error, else undefined. Lets the patch applier
   * refuse to write a corrupted file (a malformed find/replace leaving a dangling
   * brace/token) so the loop resends the patch instead of breaking the suite.
   * Optional.
   */
  validatePatchedSyntax?(path: string, content: string): string | undefined;

  testGenerationSystemPrompt(): string;

  testGenerationPrompt(params: {
    spec: TestSpec;
    context: TestCodeContext;
    attempt: number;
    coverageGaps: CoverageGap[];
    /** Patches from the prior attempt that failed to apply, to resend. */
    patchFailures?: FilePatchFailure[];
  }): string;

  /** Commands run once before the first test execution, such as dependency setup. */
  setupCommands(): CommandSpec[];

  /** Commands that run the full test + coverage suite without repeating setup. */
  executionCommands(): CommandSpec[];

  /** Human-readable coverage table extracted from the runner output. */
  extractCoverageSummary(output: string): string | undefined;

  /**
   * Parse the actual passed/failed/total test counts from the runner output
   * (e.g. Jest's "Tests: 12 passed, 2 failed, 14 total"). Optional; undefined
   * when no summary line is present.
   */
  extractTestCounts?(
    output: string,
  ): { passed: number; failed: number; total: number } | undefined;

  /**
   * The failing-test blocks pulled to the front of the runner output, so the
   * actual cause is not buried behind the coverage table. Used as the retry
   * error summary. Optional: adapters without a bespoke extractor fall back to
   * a raw tail slice.
   */
  extractFailureSummary?(output: string): string | undefined;

  /**
   * Optional deterministic repairs for common invalid generated-test patterns
   * discovered after a real runner failure.
   */
  repairGeneratedTests?(params: {
    appDir: string;
    errorSummary: string;
    workspace: WorkspaceWriter;
    context?: TestCodeContext;
  }): Promise<GeneratedFile[]>;

  /** Per-file coverage gaps below the adapter's configured target. */
  readCoverageGaps(appDir: string): Promise<CoverageGap[]>;
}
