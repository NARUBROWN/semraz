import { Injectable } from '@nestjs/common';
import { CommandSpec, FilePatchFailure, GeneratedFile, TargetFramework } from '../../builds/types/build.types';
import { WorkspaceWriter } from '../../builds/runtime/workspace-writer';
import { CoverageGap, TestCodeContext, TestSpec } from '../types/test.types';
import { TestTargetAdapter } from './test-target-adapter';

@Injectable()
export class SpineTestAdapter implements TestTargetAdapter {
  readonly target = TargetFramework.SpineGo;
  constructor(private readonly workspace: WorkspaceWriter) {}
  async harnessFiles(_appDir: string, _spec?: TestSpec): Promise<GeneratedFile[]> { return []; }
  isTestFile(path: string) { return path.endsWith('_test.go'); }
  isPatchablePath(path: string) { return this.isTestFile(path); }
  normalizeTestFiles(files: GeneratedFile[], _context?: TestCodeContext) { return files; }
  testGenerationSystemPrompt() { return 'Generate Go testing package tests for a Spine application. Return JSON with files and patches; never modify application files.'; }
  testGenerationPrompt(_params: { spec: TestSpec; context: TestCodeContext; attempt: number; coverageGaps: CoverageGap[]; patchFailures?: FilePatchFailure[]; targetFile?: string }) { return 'Write focused *_test.go tests using Go standard testing. Preserve application files.'; }
  setupCommands(): CommandSpec[] { return [{ command: 'go', args: ['mod', 'tidy'], description: 'Resolve Go test dependencies' }]; }
  executionCommands(): CommandSpec[] { return [{ command: 'go', args: ['test', './...'], description: 'Run Go tests' }]; }
  targetExecutionCommands(testFile: string): CommandSpec[] { return [{ command: 'go', args: ['test', './...', '-run', testFile.replace(/_test\\.go$/, '')], description: 'Run selected Go test' }]; }
  extractCoverageSummary(_output: string) { return undefined; }
  async readCoverageGaps(_appDir: string): Promise<CoverageGap[]> { return []; }
}
