import {
  AppSpec,
  BuildPlan,
  BuildTask,
  CodeContext,
  CommandSpec,
  EntitySpec,
  GeneratedFile,
  TargetFramework,
} from '../types/build.types';
import { LanguageAdapter } from '../languages/language-adapter';
import { WorkspaceWriter } from '../runtime/workspace-writer';

export interface TargetAdapter {
  target: TargetFramework;
  language: LanguageAdapter;
  planningGuidance: string;
  bootstrapGuidance: string;
  bootstrapFiles(spec: AppSpec): GeneratedFile[];
  planBuildTasks(spec: AppSpec): BuildPlan;
  entityContextHints(entity: EntitySpec): string[];
  taskContextHints(task: BuildTask): string[];
  /** Files that must be returned for the task to be considered complete. */
  requiredTaskFiles(task: BuildTask): string[];
  /** Enables an independent LLM contract review for high-risk generated tasks. */
  requiresIndependentTaskReview?(task: BuildTask): boolean;
  validateTaskFiles?(params: {
    spec: AppSpec;
    task: BuildTask;
    files: GeneratedFile[];
  }): string[];
  /** Whole-application contract gate run after every final build/smoke pass. */
  validateApplicationFiles?(params: {
    spec: AppSpec;
    files: GeneratedFile[];
  }): string[];
  taskGenerationPrompt(params: {
    spec: AppSpec;
    task: BuildTask;
    context: CodeContext;
  }): string;
  normalizeGeneratedFiles(files: GeneratedFile[]): GeneratedFile[];
  mergeGeneratedFile(params: {
    rootDir: string;
    file: GeneratedFile;
    existingContent?: string;
  }): GeneratedFile;
  postProcessAppliedFiles(params: {
    rootDir: string;
    changedFiles: string[];
    workspace: WorkspaceWriter;
  }): Promise<string[]>;
  installCommands(): CommandSpec[];
  buildCommands(): CommandSpec[];
  syntaxCheckCommands(): CommandSpec[];
  e2eCheckCommands(spec?: AppSpec, task?: BuildTask): CommandSpec[];
}
