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
  taskGenerationPrompt(params: {
    spec: AppSpec;
    task: BuildTask;
    context: CodeContext;
  }): string;
  deterministicTaskFiles?(params: {
    spec: AppSpec;
    task: BuildTask;
    context: CodeContext;
  }): GeneratedFile[];
  entityGenerationPrompt(params: {
    spec: AppSpec;
    entity: EntitySpec;
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
  e2eCheckCommands(): CommandSpec[];
}
