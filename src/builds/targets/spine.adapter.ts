import { Injectable } from '@nestjs/common';
import { AppSpec, BuildPlan, BuildTask, CodeContext, CommandSpec, EntitySpec, GeneratedFile, TargetFramework } from '../types/build.types';
import { GoLanguageAdapter } from '../languages/go-language.adapter';
import { WorkspaceWriter } from '../runtime/workspace-writer';
import { TargetAdapter } from './target-adapter';

@Injectable()
export class SpineTargetAdapter implements TargetAdapter {
  readonly target = TargetFramework.SpineGo;
  readonly planningGuidance = 'Plan a Spine Go HTTP service with explicit constructor registration.';
  readonly bootstrapGuidance = 'Use Go 1.25.5+, github.com/NARUBROWN/spine, app.Constructor, method-expression routes, httpx.Response, httperr, and boot.HTTPOptions.';
  constructor(readonly language: GoLanguageAdapter) {}
  bootstrapFiles(spec: AppSpec): GeneratedFile[] {
    const module = (spec.projectName || 'spine-app').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'spine-app';
    return [
      { path: 'go.mod', content: `module generated/${module}\n\ngo 1.25.5\n\nrequire github.com/NARUBROWN/spine v0.0.0\n` },
      { path: 'main.go', content: ['package main', '', 'import (', '  "log"', '  "github.com/NARUBROWN/spine"', '  "github.com/NARUBROWN/spine/pkg/boot"', '  "github.com/NARUBROWN/spine/pkg/httpx"', ')', '', 'type HealthController struct{}', 'func NewHealthController() *HealthController { return &HealthController{} }', 'func (c *HealthController) Get() httpx.Response[map[string]any] { return httpx.Response[map[string]any]{Body: map[string]any{"status":"ok","service":"spine"}} }', '', 'func main() {', '  app := spine.New()', '  app.Constructor(NewHealthController)', '  app.Route("GET", "/health", (*HealthController).Get)', '  if err := app.Run(boot.Options{Address: ":8080", HTTP: &boot.HTTPOptions{}}); err != nil { log.Fatal(err) }', '}', ''].join('\n') },
      { path: 'README.md', content: `# ${spec.projectName || 'Spine application'}\n\nRun with go run .\n` },
    ];
  }
  planBuildTasks(_spec: AppSpec): BuildPlan { return { tasks: [{ id: 'spine-bootstrap', kind: 'business-workflow', title: 'Bootstrap Spine application', description: 'Create a runnable Spine HTTP application.', dependsOn: [], allowedFiles: ['main.go', 'go.mod', 'README.md'], doneCriteria: ['GET /health returns a successful response'] }] }; }
  entityContextHints(_entity: EntitySpec): string[] { return ['Use Go structs and repository/service/controller constructors.']; }
  taskContextHints(_task: BuildTask): string[] { return ['Register all DI constructors and HTTP routes with Spine.']; }
  requiredTaskFiles(_task: BuildTask): string[] { return ['main.go', 'go.mod']; }
  taskGenerationPrompt({ task }: { spec: AppSpec; task: BuildTask; context: CodeContext }): string { return `${this.bootstrapGuidance}\nTask: ${task.title}. Return complete Go files only.`; }
  normalizeGeneratedFiles(files: GeneratedFile[]): GeneratedFile[] { return files; }
  mergeGeneratedFile({ file }: { rootDir: string; file: GeneratedFile; existingContent?: string }): GeneratedFile { return file; }
  async postProcessAppliedFiles(_params: { rootDir: string; changedFiles: string[]; workspace: WorkspaceWriter }): Promise<string[]> { return []; }
  installCommands(): CommandSpec[] { return [{ command: 'go', args: ['mod', 'tidy'], description: 'Resolve Spine Go dependencies' }]; }
  buildCommands(): CommandSpec[] { return [{ command: 'go', args: ['build', './...'], description: 'Compile Spine application' }]; }
  syntaxCheckCommands(): CommandSpec[] { return this.buildCommands(); }
  e2eCheckCommands(): CommandSpec[] { return [{ command: 'go', args: ['test', './...'], description: 'Run Spine application tests' }]; }
}
