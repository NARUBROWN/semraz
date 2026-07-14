export enum TargetFramework {
  NestJS = 'nestjs',
  SpineGo = 'spine-go',
  FastAPI = 'fastapi',
}

export enum SourceLanguage {
  TypeScript = 'typescript',
  Python = 'python',
  Go = 'go',
}

export interface NormalizedBuildRequest {
  target: TargetFramework;
  projectDir: string;
  outputName: string;
  workspaceId?: string;
}

export interface MarkdownDocument {
  path: string;
  content: string;
}

export interface AppSpec {
  projectName: string;
  summary: string;
  entities: EntitySpec[];
  endpoints: Array<Record<string, unknown>>;
  auth?: Record<string, unknown>;
  database?: Record<string, unknown>;
  businessRules: string[];
  assumptions: string[];
}

export interface EntitySpec {
  name: string;
  description?: string;
  fields: Array<Record<string, unknown>>;
  relations: Array<Record<string, unknown>>;
  endpoints: Array<Record<string, unknown>>;
  businessRules: string[];
  source?: Record<string, unknown>;
}

export interface PlannedFile {
  path: string;
  purpose: string;
}

export interface FilePlan {
  target: TargetFramework;
  rootDir: string;
  files: PlannedFile[];
  installCommands: CommandSpec[];
  buildCommands: CommandSpec[];
}

export interface GeneratedFile {
  path: string;
  content: string;
}

/** A single find/replace edit applied to an existing file. */
export interface FileEdit {
  find: string;
  replace: string;
}

/**
 * A targeted patch to an existing file: a set of find/replace edits applied in
 * order. Preferred over a full-file rewrite when only part of a file changes,
 * so the model does not regenerate (and risk regressing) passing code.
 */
export interface FilePatch {
  path: string;
  edits: FileEdit[];
}

/** Outcome of attempting to apply one FilePatch. */
export interface FilePatchFailure {
  path: string;
  reason: string;
}

export interface CommandSpec {
  command: string;
  args: string[];
  description: string;
  /** Per-command environment overrides. A null value removes an inherited variable. */
  env?: Record<string, string | null>;
}

export interface CommandResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  success: boolean;
}

export interface BuildRunResult {
  success: boolean;
  commands: CommandResult[];
  errorSummary?: string;
}

export interface ArtifactSummary {
  outputDir: string;
  fileCount: number;
  files: string[];
}

export interface BuildResponse {
  target: TargetFramework;
  outputDir: string;
  spec: AppSpec;
  plan: FilePlan;
  build: BuildRunResult;
  artifact: ArtifactSummary;
  repairAttempts: number;
  finalRepairAttempts: number;
  completedEntities: EntityImplementationResult[];
  buildPlan: BuildPlan;
  completedTasks: TaskExecutionResult[];
}

export interface BuildProgressEvent {
  stage: 'started' | 'completed' | 'failed';
  message: string;
  detail?: Record<string, unknown>;
}

export type BuildTaskKind =
  | 'entity-fields'
  | 'entity-relations'
  | 'orm-registration'
  | 'crud-feature'
  | 'endpoint-workflow'
  | 'business-workflow'
  | 'final-e2e';

export interface BuildTask {
  id: string;
  kind: BuildTaskKind;
  title: string;
  description: string;
  targetEntity?: string;
  dependsOn: string[];
  allowedFiles: string[];
  doneCriteria: string[];
}

export interface BuildPlan {
  tasks: BuildTask[];
}

export interface TaskExecutionResult {
  taskId: string;
  title: string;
  success: boolean;
  attempts: number;
  changedFiles: string[];
  syntaxResult?: BuildRunResult;
  e2eResult?: BuildRunResult;
}

export interface CodeSymbol {
  filePath: string;
  kind: string;
  name: string;
  decorators: string[];
}

export interface CodeContext {
  entity?: EntitySpec;
  task?: BuildTask;
  relevantFiles: string[];
  fileContents: Array<{ path: string; content: string }>;
  symbols: CodeSymbol[];
  previousFailures: BuildRunResult[];
  instructions: string[];
}

export interface EntityImplementationResult {
  entityName: string;
  success: boolean;
  attempts: number;
  changedFiles: string[];
  syntaxResult?: BuildRunResult;
  e2eResult?: BuildRunResult;
}
