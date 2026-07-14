import {
  BuildRunResult,
  CodeSymbol,
  GeneratedFile,
  TargetFramework,
} from '../../builds/types/build.types';

export interface NormalizedTestRequest {
  target: TargetFramework;
  appDir: string;
  projectDir: string;
  maxAttempts: number;
  workspaceId?: string;
}

export interface TestEndpointSpec {
  entityName: string;
  operationName: string;
  method: string;
  path: string;
  description: string;
  requestFields: Array<Record<string, unknown>>;
  responseFields: Array<Record<string, unknown>>;
}

export interface TestSpec {
  projectName: string;
  summary: string;
  endpoints: TestEndpointSpec[];
  businessRules: string[];
  sourceDocs: Array<{ path: string; content: string }>;
}

export interface TestContextFile {
  path: string;
  content: string;
}

export interface ControllerMethodContract {
  name: string;
  httpMethod?: string;
  path?: string;
}

export interface ControllerContract {
  className: string;
  filePath: string;
  basePath?: string;
  methods: ControllerMethodContract[];
}

export interface TestFailureDiagnosis {
  filePath: string;
  kind: 'missing-controller-method';
  message: string;
  controllerClass?: string;
  missingMethod?: string;
  availableMethods: string[];
}

export interface TestCodeContext {
  relevantFiles: TestContextFile[];
  symbols: CodeSymbol[];
  previousFailures: BuildRunResult[];
  controllerContracts: ControllerContract[];
  failureDiagnoses: TestFailureDiagnosis[];
  failedSpecPaths: string[];
  instructions: string[];
}

export interface CoverageGap {
  path: string;
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export interface TestRunResult extends BuildRunResult {
  coverageSummary?: string;
  coverageGaps?: CoverageGap[];
  // Actual test counts parsed from the runner's "Tests: X passed, Y failed"
  // summary line, so the UI shows real numbers instead of a 1/0 pass flag.
  testsPassed?: number;
  testsFailed?: number;
  testsTotal?: number;
}

export interface TestGenerationResult {
  files: GeneratedFile[];
}

export interface TestResponse {
  target: TargetFramework;
  appDir: string;
  projectDir: string;
  spec: TestSpec;
  generatedFiles: GeneratedFile[];
  changedFiles: string[];
  test: TestRunResult;
  attempts: number;
  /** Number of actual runner invocations, including deterministic repair reruns. */
  testRuns: number;
  verified: boolean;
}

export interface TestProgressEvent {
  stage: 'started' | 'completed' | 'failed';
  message: string;
  detail?: Record<string, unknown>;
}
