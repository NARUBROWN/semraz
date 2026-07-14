export type WorkspaceSnapshotBody = {
  name?: string;
  description?: string;
  framework?: string;
  database?: string;
  status?: 'planning' | 'compile_failed' | 'verified';
  currentStep?: string;
  flowStep?: number;
  workspaceId?: string | null;
  workspacePath?: string | null;
  nestJsAppPath?: string | null;
  metrics?: {
    entities?: number;
    operations?: number;
    tests?: number;
    coverage?: string | null;
  };
  draftProject?: Record<string, unknown> | null;
  entities?: unknown[] | null;
  relations?: unknown[] | null;
  operations?: unknown[] | null;
  generatedWorkspace?: Record<string, unknown> | null;
  generatedNestResult?: Record<string, unknown> | null;
  testAgentResult?: Record<string, unknown> | null;
};
