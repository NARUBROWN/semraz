import { BadRequestException, Injectable } from '@nestjs/common';
import { END, START, StateGraph, Annotation } from '@langchain/langgraph';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { BuildRequestDto } from '../dto/build-request.dto';
import { OpenAiJsonClient } from '../llm/openai-json.client';
import { CommandRunner } from '../runtime/command-runner';
import { WorkspaceWriter } from '../runtime/workspace-writer';
import { TargetAdapterRegistry } from '../targets/target-adapter.registry';
import { BackendPlannerAgent } from '../agents/backend-planner.agent';
import { CodeContextAgent } from '../agents/code-context.agent';
import { CodeGenerationAgent } from '../agents/code-generation.agent';
import { SyntaxCheckAgent } from '../agents/syntax-check.agent';
import { E2ECheckAgent } from '../agents/e2e-check.agent';
import { CodePatchTool } from '../tools/code-patch.tool';
import {
  AppSpec,
  ArtifactSummary,
  BuildPlan,
  BuildProgressEvent,
  BuildTask,
  BuildResponse,
  BuildRunResult,
  CodeContext,
  EntityImplementationResult,
  EntitySpec,
  FilePlan,
  GeneratedFile,
  MarkdownDocument,
  NormalizedBuildRequest,
  TaskExecutionResult,
} from '../types/build.types';

const BuildState = Annotation.Root({
  request: Annotation<NormalizedBuildRequest>(),
  outputDir: Annotation<string>(),
  docs: Annotation<MarkdownDocument[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  spec: Annotation<AppSpec | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  plan: Annotation<FilePlan | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  generatedFiles: Annotation<GeneratedFile[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  buildResult: Annotation<BuildRunResult | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  artifact: Annotation<ArtifactSummary | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  completedEntities: Annotation<EntityImplementationResult[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  buildPlan: Annotation<BuildPlan>({
    reducer: (_current, update) => update,
    default: () => ({ tasks: [] }),
  }),
  completedTasks: Annotation<TaskExecutionResult[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  currentTask: Annotation<BuildTask | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  hasCurrentTask: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
  currentEntity: Annotation<EntitySpec | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  currentContext: Annotation<CodeContext | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  currentTaskGeneratedFiles: Annotation<GeneratedFile[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  currentTaskChangedFiles: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  currentTaskSyntaxResult: Annotation<BuildRunResult | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  currentTaskE2EResult: Annotation<BuildRunResult | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  currentTaskFailures: Annotation<BuildRunResult[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  currentTaskAttempts: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  repairAttempts: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
});

type BuildStateType = typeof BuildState.State;

const INTERNAL_REPAIR_ATTEMPT_LIMIT = 8;
const APPLICATION_GRAPH_RECURSION_LIMIT = 700;
const TASK_REPAIR_ATTEMPT_LIMIT = 8;

@Injectable()
export class ApplicationBuildGraph {
  constructor(
    private readonly llm: OpenAiJsonClient,
    private readonly commandRunner: CommandRunner,
    private readonly workspace: WorkspaceWriter,
    private readonly targetAdapters: TargetAdapterRegistry,
    private readonly backendPlannerAgent: BackendPlannerAgent,
    private readonly codeContextAgent: CodeContextAgent,
    private readonly codeGenerationAgent: CodeGenerationAgent,
    private readonly syntaxCheckAgent: SyntaxCheckAgent,
    private readonly e2eCheckAgent: E2ECheckAgent,
    private readonly codePatchTool: CodePatchTool,
  ) {}

  async run(
    dto: BuildRequestDto,
    onProgress?: (event: BuildProgressEvent) => void,
  ): Promise<BuildResponse> {
    const request = await this.normalizeRequest(dto);
    const outputDir = this.workspace.createOutputDir(
      request.projectDir,
      request.outputName,
    );

    onProgress?.({
      stage: 'started',
      message: `Preparing ${request.target} output directory`,
      detail: { outputDir },
    });

    const graph = new StateGraph(BuildState)
      .addNode('readDocs', this.withProgress('Reading markdown design documents', this.readDocs.bind(this), onProgress))
      .addNode('normalizeSpec', this.withProgress('Normalizing application specification', this.normalizeSpec.bind(this), onProgress))
      .addNode('planFiles', this.withProgress('Planning NestJS bootstrap files', this.planFiles.bind(this), onProgress))
      .addNode('generateFiles', this.withProgress('Generating NestJS bootstrap files', this.generateFiles.bind(this), onProgress))
      .addNode('writeFiles', this.withProgress('Writing bootstrap files to workspace', this.writeFiles.bind(this), onProgress))
      .addNode('runBuild', this.withProgress('Installing dependencies and compiling bootstrap app', this.runBuild.bind(this), onProgress))
      .addNode('repairFiles', this.withProgress('Repairing bootstrap build failures', this.repairFiles.bind(this), onProgress))
      .addNode('planBuildTasks', this.withProgress('Planning entity, ORM, and CRUD tasks', this.planBuildTasks.bind(this), onProgress))
      .addNode('selectNextTask', this.withProgress('Selecting next generation task', this.selectNextTask.bind(this), onProgress))
      .addNode('taskPlanner', this.withProgress('Preparing selected task', this.taskPlanner.bind(this), onProgress))
      .addNode('codeContext', this.withProgress('Reading relevant generated code context', this.codeContext.bind(this), onProgress))
      .addNode('codeGeneration', this.withProgress('Generating task implementation files', this.codeGeneration.bind(this), onProgress))
      .addNode('applyPatch', this.withProgress('Applying generated file changes', this.applyPatch.bind(this), onProgress))
      .addNode('syntaxCheck', this.withProgress('Running TypeScript build check', this.syntaxCheck.bind(this), onProgress))
      .addNode('e2eCheck', this.withProgress('Running generated app verification gate', this.e2eCheck.bind(this), onProgress))
      .addNode('recordCompletedTask', this.withProgress('Recording completed task', this.recordCompletedTask.bind(this), onProgress))
      .addNode('recordFailedTask', this.withProgress('Recording failed task', this.recordFailedTask.bind(this), onProgress))
      .addNode('runFinalBuild', this.withProgress('Running final NestJS app build', this.runBuild.bind(this), onProgress))
      .addNode('packageArtifact', this.withProgress('Collecting generated artifact summary', this.packageArtifact.bind(this), onProgress))
      .addEdge(START, 'readDocs')
      .addEdge('readDocs', 'normalizeSpec')
      .addEdge('normalizeSpec', 'planFiles')
      .addEdge('planFiles', 'generateFiles')
      .addEdge('generateFiles', 'writeFiles')
      .addEdge('writeFiles', 'runBuild')
      .addConditionalEdges('runBuild', (state) => this.nextAfterBootstrapBuild(state), {
        repairFiles: 'repairFiles',
        planBuildTasks: 'planBuildTasks',
        packageArtifact: 'packageArtifact',
      })
      .addEdge('repairFiles', 'runBuild')
      .addEdge('planBuildTasks', 'selectNextTask')
      .addConditionalEdges('selectNextTask', (state) => this.nextAfterSelectTask(state), {
        taskPlanner: 'taskPlanner',
        runFinalBuild: 'runFinalBuild',
      })
      .addEdge('taskPlanner', 'codeContext')
      .addEdge('codeContext', 'codeGeneration')
      .addEdge('codeGeneration', 'applyPatch')
      .addEdge('applyPatch', 'syntaxCheck')
      .addConditionalEdges('syntaxCheck', (state) => this.nextAfterTaskSyntax(state), {
        taskPlanner: 'taskPlanner',
        e2eCheck: 'e2eCheck',
        recordFailedTask: 'recordFailedTask',
      })
      .addConditionalEdges('e2eCheck', (state) => this.nextAfterTaskE2E(state), {
        taskPlanner: 'taskPlanner',
        recordCompletedTask: 'recordCompletedTask',
        recordFailedTask: 'recordFailedTask',
      })
      .addEdge('recordCompletedTask', 'selectNextTask')
      .addEdge('recordFailedTask', 'runFinalBuild')
      .addEdge('runFinalBuild', 'packageArtifact')
      .addEdge('packageArtifact', END)
      .compile();

    const finalState = await graph.invoke(
      {
        request,
        outputDir,
        repairAttempts: 0,
      },
      { recursionLimit: APPLICATION_GRAPH_RECURSION_LIMIT },
    );

    if (!finalState.spec || !finalState.plan || !finalState.buildResult || !finalState.artifact) {
      throw new BadRequestException('Build graph finished without required state');
    }

    onProgress?.({
      stage: finalState.buildResult.success ? 'completed' : 'failed',
      message: finalState.buildResult.success
        ? 'NestJS app generation completed'
        : 'NestJS app generation completed with build errors',
      detail: { outputDir, success: finalState.buildResult.success },
    });

    return {
      target: request.target,
      outputDir,
      spec: finalState.spec,
      plan: finalState.plan,
      build: finalState.buildResult,
      artifact: finalState.artifact,
      repairAttempts: finalState.repairAttempts,
      completedEntities: finalState.completedEntities,
      buildPlan: finalState.buildPlan,
      completedTasks: finalState.completedTasks,
    };
  }

  private withProgress(
    message: string,
    node: (state: BuildStateType) => Promise<Partial<BuildStateType>>,
    onProgress?: (event: BuildProgressEvent) => void,
  ) {
    return async (state: BuildStateType) => {
      onProgress?.({ stage: 'started', message });
      try {
        const result = await node(state);
        onProgress?.({ stage: 'completed', message });
        return result;
      } catch (error) {
        onProgress?.({
          stage: 'failed',
          message,
          detail: { error: error instanceof Error ? error.message : 'Unknown error' },
        });
        throw error;
      }
    };
  }

  private async normalizeRequest(dto: BuildRequestDto): Promise<NormalizedBuildRequest> {
    const projectDir = this.workspace.resolveProjectDir(dto.projectDir);
    const outputName =
      dto.outputName ??
      `${dto.target}-${new Date().toISOString().replace(/[:.]/g, '-').toLowerCase()}`;

    return {
      target: dto.target,
      projectDir,
      outputName,
    };
  }

  private async readDocs(state: BuildStateType): Promise<Partial<BuildStateType>> {
    const docFiles = await this.findMarkdownFiles(state.request.projectDir);
    const docs: MarkdownDocument[] = [];

    for (const docFile of docFiles) {
      const absolutePath = this.workspace.resolveInside(state.request.projectDir, docFile);
      docs.push({
        path: docFile,
        content: await this.workspace.readTextFile(absolutePath),
      });
    }

    return { docs };
  }

  private async findMarkdownFiles(projectDir: string): Promise<string[]> {
    try {
      const files = await this.workspace.listMarkdownFiles(projectDir);
      if (files.length === 0) {
        throw new BadRequestException(
          `No markdown design documents were found in ${projectDir}`,
        );
      }

      return files;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Could not read markdown documents from ${projectDir}: ${(error as Error).message}`,
      );
    }
  }

  private async normalizeSpec(state: BuildStateType): Promise<Partial<BuildStateType>> {
    const parsedSpec = this.parseMarkdownSpec(state);
    if (parsedSpec.entities.length > 0) {
      return { spec: parsedSpec };
    }

    const rawSpec = await this.llm.generateJson<AppSpec>({
      system:
        'You convert product and engineering markdown documents into a strict JSON application specification. Return JSON only.',
      user: [
        'Create a normalized application spec from these markdown files.',
        'Required JSON keys: projectName, summary, entities, endpoints, auth, database, businessRules, assumptions.',
        'Each entity must include name, fields, relations, endpoints, businessRules.',
        'Use arrays for entities, endpoints, businessRules, assumptions, fields, and relations.',
        'Do not invent requirements when the docs are silent; put uncertainty in assumptions.',
        '',
        this.formatDocs(state.docs),
      ].join('\n'),
    });

    return {
      spec: {
        projectName: rawSpec.projectName ?? state.request.outputName,
        summary: rawSpec.summary ?? '',
        entities: this.cleanEntities(rawSpec.entities ?? []),
        endpoints: Array.isArray(rawSpec.endpoints) ? rawSpec.endpoints : [],
        auth: rawSpec.auth ?? {},
        database: rawSpec.database ?? {},
        businessRules: Array.isArray(rawSpec.businessRules) ? rawSpec.businessRules : [],
        assumptions: Array.isArray(rawSpec.assumptions) ? rawSpec.assumptions : [],
      },
    };
  }

  private parseMarkdownSpec(state: BuildStateType): AppSpec {
    const docsByPath = new Map(
      state.docs.map((doc) => [doc.path.toLowerCase(), doc.content]),
    );
    const projectDoc = docsByPath.get('project.md') ?? state.docs[0]?.content ?? '';
    const erdDoc = docsByPath.get('erd.md') ?? '';
    const endpointsDoc = docsByPath.get('endpoints.md') ?? '';
    const rulesDoc = docsByPath.get('rules.md') ?? '';
    const entities = this.parseErdEntities(erdDoc);
    const endpoints = this.parseEndpointRows(endpointsDoc);
    const endpointsByEntity = this.groupEndpointsByEntity(endpoints, entities);

    return {
      projectName: this.firstMarkdownHeading(projectDoc) ?? state.request.outputName,
      summary: this.firstParagraphAfterHeading(projectDoc) ?? '',
      entities: entities.map((entity) => ({
        ...entity,
        endpoints: endpointsByEntity.get(entity.name) ?? [],
      })),
      endpoints,
      auth: {},
      database: { source: 'markdown', recommendedLocalDriver: 'sqljs' },
      businessRules: this.parseBulletRows(rulesDoc),
      assumptions: [
        'Application spec was normalized from markdown tables and bullet lists.',
      ],
    };
  }

  private parseErdEntities(erdDoc: string): EntitySpec[] {
    const relationshipLines = this.sectionContent(erdDoc, 'Relationships')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '));
    const relationMap = new Map<string, Array<Record<string, unknown>>>();
    const entityRegex =
      /^##\s+Entity:\s+(.+?)\s*$(?<body>[\s\S]*?)(?=^##\s+Entity:\s+|^##\s+Relationships\s*$|\z)/gm;
    const entities: EntitySpec[] = [];
    let match: RegExpExecArray | null;

    while ((match = entityRegex.exec(erdDoc)) !== null) {
      const name = match[1].trim();
      const body = match.groups?.body ?? '';
      entities.push({
        name,
        fields: this.parseMarkdownTable(body),
        relations: [],
        endpoints: [],
        businessRules: [],
      });
      relationMap.set(name, []);
    }

    for (const line of relationshipLines) {
      const relation = line.replace(/^-\s+/, '').trim();
      const relationMatch = relation.match(/^(.+?)\s+(1:N|N:1|1:1)\s+(.+)$/);
      if (!relationMatch) {
        continue;
      }

      const from = relationMatch[1].trim();
      const cardinality = relationMatch[2];
      const to = relationMatch[3].trim();
      relationMap.get(from)?.push({
        source: from,
        target: to,
        cardinality,
        kind: cardinality === '1:N' ? 'one-to-many' : cardinality === 'N:1' ? 'many-to-one' : 'one-to-one',
      });
      relationMap.get(to)?.push({
        source: to,
        target: from,
        cardinality: cardinality === '1:N' ? 'N:1' : cardinality === 'N:1' ? '1:N' : '1:1',
        kind: cardinality === '1:N' ? 'many-to-one' : cardinality === 'N:1' ? 'one-to-many' : 'one-to-one',
      });
    }

    return entities.map((entity) => ({
      ...entity,
      relations: relationMap.get(entity.name) ?? [],
    }));
  }

  private parseMarkdownTable(section: string): Array<Record<string, unknown>> {
    return section
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('|') && line.endsWith('|'))
      .filter((line) => !/^\|\s*-+/.test(line))
      .slice(1)
      .map((line) => {
        const [name, type, required, notes] = line
          .slice(1, -1)
          .split('|')
          .map((cell) => cell.trim());
        return {
          name,
          type,
          required: required?.toLowerCase() === 'yes',
          notes,
        };
      })
      .filter((field) => typeof field.name === 'string' && field.name.length > 0);
  }

  private parseEndpointRows(endpointsDoc: string): Array<Record<string, unknown>> {
    const endpoints: Array<Record<string, unknown>> = [];
    let section = '';
    let currentEndpoint: Record<string, unknown> | undefined;
    let detailSection: 'requestFields' | 'responseFields' | undefined;

    for (const line of endpointsDoc.split('\n')) {
      const heading = line.match(/^##\s+(.+?)\s*$/);
      if (heading) {
        section = heading[1].trim();
        currentEndpoint = undefined;
        detailSection = undefined;
        continue;
      }

      if (/^####\s+Request Fields\s*$/i.test(line)) {
        detailSection = 'requestFields';
        continue;
      }

      if (/^####\s+Response Fields\s*$/i.test(line)) {
        detailSection = 'responseFields';
        continue;
      }

      if (/^####\s+/.test(line)) {
        detailSection = undefined;
        continue;
      }

      const endpoint = line.match(/^-\s+`(GET|POST|PATCH|PUT|DELETE)\s+([^`]+)`(?:\s+(.*))?$/);
      if (endpoint) {
        currentEndpoint = {
          section,
          method: endpoint[1],
          path: endpoint[2].trim(),
          description: endpoint[3]?.trim() ?? '',
          requestFields: [],
          responseFields: [],
        };
        endpoints.push(currentEndpoint);
        detailSection = undefined;
        continue;
      }

      const field = line.match(/^-\s+([^:]+):\s+(.+?)\s*$/);
      if (currentEndpoint && detailSection && field) {
        const fields = currentEndpoint[detailSection];
        if (Array.isArray(fields)) {
          fields.push({
            name: field[1].trim(),
            type: field[2].trim(),
          });
        }
      }
    }
    return endpoints;
  }

  private groupEndpointsByEntity(
    endpoints: Array<Record<string, unknown>>,
    entities: EntitySpec[],
  ) {
    const byEntity = new Map<string, Array<Record<string, unknown>>>();
    const entityBySection = new Map(
      entities.map((entity) => [
        this.normalizeName(this.pluralizeLabel(entity.name)),
        entity.name,
      ]),
    );

    for (const endpoint of endpoints) {
      const section = typeof endpoint.section === 'string' ? endpoint.section : '';
      const entityName = entityBySection.get(this.normalizeName(section));
      if (!entityName) {
        continue;
      }

      const current = byEntity.get(entityName) ?? [];
      current.push(endpoint);
      byEntity.set(entityName, current);
    }

    return byEntity;
  }

  private parseBulletRows(markdown: string): string[] {
    return markdown
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.replace(/^-\s+/, '').trim());
  }

  private firstMarkdownHeading(markdown: string) {
    return markdown.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  }

  private firstParagraphAfterHeading(markdown: string) {
    return markdown
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#') && !line.startsWith('- '));
  }

  private sectionContent(markdown: string, heading: string) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return markdown.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|\\z)`, 'm'))?.[1] ?? '';
  }

  private normalizeName(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private pluralizeLabel(value: string) {
    if (value.endsWith('y')) {
      return `${value.slice(0, -1)}ies`;
    }
    return `${value}s`;
  }

  private async planFiles(state: BuildStateType): Promise<Partial<BuildStateType>> {
    if (!state.spec) {
      throw new BadRequestException('Cannot plan files without a normalized spec');
    }

    const adapter = this.targetAdapters.get(state.request.target);
    const bootstrapFiles = adapter.bootstrapFiles(state.spec);

    return {
      plan: {
        target: state.request.target,
        rootDir: state.outputDir,
        files: bootstrapFiles.map((file) => ({
          path: file.path,
          purpose: 'Initial generated application shell file',
        })),
        installCommands: adapter.installCommands(),
        buildCommands: adapter.buildCommands(),
      },
    };
  }

  private async generateFiles(state: BuildStateType): Promise<Partial<BuildStateType>> {
    if (!state.spec || !state.plan) {
      throw new BadRequestException('Cannot generate files without spec and file plan');
    }

    const adapter = this.targetAdapters.get(state.request.target);
    return { generatedFiles: adapter.bootstrapFiles(state.spec) };
  }

  private async planBuildTasks(state: BuildStateType): Promise<Partial<BuildStateType>> {
    if (!state.spec) {
      throw new BadRequestException('Cannot plan build tasks without a normalized spec');
    }

    const adapter = this.targetAdapters.get(state.request.target);
    return {
      buildPlan: this.backendPlannerAgent.plan(state.spec, adapter),
    };
  }

  private async selectNextTask(state: BuildStateType): Promise<Partial<BuildStateType>> {
    const completedTaskIds = new Set(state.completedTasks.map((task) => task.taskId));
    const nextTask = state.buildPlan.tasks.find(
      (task) =>
        !completedTaskIds.has(task.id) &&
        this.areDependenciesSatisfied(task.dependsOn, state.completedTasks),
    );

    if (!nextTask) {
      const hasRemainingTasks = state.buildPlan.tasks.some(
        (task) => !completedTaskIds.has(task.id),
      );
      if (hasRemainingTasks) {
        throw new BadRequestException(
          'Build task graph is blocked because remaining task dependencies were not satisfied',
        );
      }

      return {
        currentTask: undefined,
        hasCurrentTask: false,
        currentEntity: undefined,
        currentContext: undefined,
        currentTaskGeneratedFiles: [],
        currentTaskChangedFiles: [],
        currentTaskSyntaxResult: undefined,
        currentTaskE2EResult: undefined,
        currentTaskFailures: [],
        currentTaskAttempts: 0,
      };
    }

    return {
      currentTask: nextTask,
      hasCurrentTask: true,
      currentEntity: nextTask.targetEntity
        ? state.spec?.entities.find((entity) => entity.name === nextTask.targetEntity)
        : undefined,
      currentContext: undefined,
      currentTaskGeneratedFiles: [],
      currentTaskChangedFiles: [],
      currentTaskSyntaxResult: undefined,
      currentTaskE2EResult: undefined,
      currentTaskFailures: [],
      currentTaskAttempts: 0,
    };
  }

  private async taskPlanner(state: BuildStateType): Promise<Partial<BuildStateType>> {
    if (!state.currentTask) {
      throw new BadRequestException('Cannot plan task work without a selected task');
    }

    return {
      currentTaskFailures: state.currentTaskFailures,
    };
  }

  private async codeContext(state: BuildStateType): Promise<Partial<BuildStateType>> {
    if (!state.currentTask) {
      throw new BadRequestException('Cannot understand code without a selected task');
    }

    const adapter = this.targetAdapters.get(state.request.target);
    const currentContext = await this.codeContextAgent.understand({
      rootDir: state.outputDir,
      entity: state.currentEntity,
      task: state.currentTask,
      adapter,
      previousFailures: state.currentTaskFailures,
    });
    return { currentContext };
  }

  private async codeGeneration(state: BuildStateType): Promise<Partial<BuildStateType>> {
    if (!state.spec || !state.currentTask || !state.currentContext) {
      throw new BadRequestException(
        'Cannot generate task code without spec, selected task, and code context',
      );
    }

    const adapter = this.targetAdapters.get(state.request.target);
    const currentTaskGeneratedFiles = await this.codeGenerationAgent.generateTaskFiles({
      spec: state.spec,
      task: state.currentTask,
      context: state.currentContext,
      adapter,
    });

    return {
      currentTaskGeneratedFiles,
      currentTaskAttempts: state.currentTaskAttempts + 1,
    };
  }

  private async applyPatch(state: BuildStateType): Promise<Partial<BuildStateType>> {
    const adapter = this.targetAdapters.get(state.request.target);
    const currentTaskChangedFiles = await this.codePatchTool.applyFileReplacements(
      state.outputDir,
      state.currentTaskGeneratedFiles,
      adapter,
    );
    return { currentTaskChangedFiles };
  }

  private async syntaxCheck(state: BuildStateType): Promise<Partial<BuildStateType>> {
    const adapter = this.targetAdapters.get(state.request.target);
    const currentTaskSyntaxResult = await this.syntaxCheckAgent.check(
      state.outputDir,
      adapter,
    );
    return {
      currentTaskSyntaxResult,
      currentTaskFailures: currentTaskSyntaxResult.success
        ? []
        : [currentTaskSyntaxResult],
    };
  }

  private async e2eCheck(state: BuildStateType): Promise<Partial<BuildStateType>> {
    const adapter = this.targetAdapters.get(state.request.target);
    const currentTaskE2EResult = await this.e2eCheckAgent.check(
      state.outputDir,
      adapter,
    );
    return {
      currentTaskE2EResult,
      currentTaskFailures: currentTaskE2EResult.success ? [] : [currentTaskE2EResult],
    };
  }

  private async recordCompletedTask(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    return {
      completedTasks: [this.currentTaskResult(state, true)],
      currentTask: undefined,
      hasCurrentTask: false,
      currentEntity: undefined,
      currentContext: undefined,
      currentTaskGeneratedFiles: [],
      currentTaskChangedFiles: [],
      currentTaskSyntaxResult: undefined,
      currentTaskE2EResult: undefined,
      currentTaskFailures: [],
      currentTaskAttempts: 0,
    };
  }

  private async recordFailedTask(state: BuildStateType): Promise<Partial<BuildStateType>> {
    return {
      completedTasks: [this.currentTaskResult(state, false)],
      hasCurrentTask: false,
    };
  }

  private async writeFiles(state: BuildStateType): Promise<Partial<BuildStateType>> {
    await fs.mkdir(state.outputDir, { recursive: true });
    await this.workspace.writeFiles(state.outputDir, state.generatedFiles);
    return {};
  }

  private async runBuild(state: BuildStateType): Promise<Partial<BuildStateType>> {
    if (!state.plan) {
      throw new BadRequestException('Cannot run build without a file plan');
    }

    const commands = [...state.plan.installCommands, ...state.plan.buildCommands];

    if (commands.length === 0) {
      return {
        buildResult: {
          success: true,
          commands: [],
        },
      };
    }

    const results = await this.commandRunner.runAll(state.outputDir, commands);
    const success = results.every((result) => result.success);

    return {
      buildResult: {
        success,
        commands: results,
        errorSummary: success ? undefined : this.summarizeErrors(results),
      },
    };
  }

  private async repairFiles(state: BuildStateType): Promise<Partial<BuildStateType>> {
    if (!state.spec || !state.plan || !state.buildResult) {
      throw new BadRequestException('Cannot repair without spec, plan, and build result');
    }

    const currentFiles = await this.readGeneratedFiles(state.outputDir);
    const repaired = await this.llm.generateJson<{ files: GeneratedFile[] }>({
      system:
        'You fix build failures by returning complete replacement file contents. Return JSON only.',
      user: [
        `Target framework: ${state.request.target}`,
        `Repair attempt: ${state.repairAttempts + 1}`,
        'Return only files that must be changed, but each returned file must contain the full final content.',
        'Do not remove required features from the spec to make the build pass.',
        '',
        'Normalized spec:',
        JSON.stringify(state.spec, null, 2),
        '',
        'Build result:',
        JSON.stringify(state.buildResult, null, 2),
        '',
        'Current files:',
        JSON.stringify(currentFiles, null, 2),
      ].join('\n'),
      temperature: 0.05,
    });

    const files = this.cleanGeneratedFiles(repaired.files ?? []);
    await this.workspace.writeFiles(state.outputDir, files);

    return {
      generatedFiles: this.mergeFiles(currentFiles, files),
      repairAttempts: state.repairAttempts + 1,
    };
  }

  private async packageArtifact(state: BuildStateType): Promise<Partial<BuildStateType>> {
    const files = await this.workspace.listFiles(state.outputDir);
    return {
      artifact: {
        outputDir: state.outputDir,
        fileCount: files.length,
        files,
      },
    };
  }

  private nextAfterBootstrapBuild(
    state: BuildStateType,
  ): 'repairFiles' | 'planBuildTasks' | 'packageArtifact' {
    if (state.buildResult?.success) {
      return 'planBuildTasks';
    }

    if (state.repairAttempts >= INTERNAL_REPAIR_ATTEMPT_LIMIT) {
      return 'packageArtifact';
    }

    return 'repairFiles';
  }

  private nextAfterSelectTask(state: BuildStateType): 'taskPlanner' | 'runFinalBuild' {
    return state.hasCurrentTask ? 'taskPlanner' : 'runFinalBuild';
  }

  private nextAfterTaskSyntax(
    state: BuildStateType,
  ): 'taskPlanner' | 'e2eCheck' | 'recordFailedTask' {
    if (state.currentTaskSyntaxResult?.success) {
      return 'e2eCheck';
    }
    return state.currentTaskAttempts >= TASK_REPAIR_ATTEMPT_LIMIT
      ? 'recordFailedTask'
      : 'taskPlanner';
  }

  private nextAfterTaskE2E(
    state: BuildStateType,
  ): 'taskPlanner' | 'recordCompletedTask' | 'recordFailedTask' {
    if (state.currentTaskE2EResult?.success) {
      return 'recordCompletedTask';
    }
    return state.currentTaskAttempts >= TASK_REPAIR_ATTEMPT_LIMIT
      ? 'recordFailedTask'
      : 'taskPlanner';
  }

  private currentTaskResult(
    state: BuildStateType,
    success: boolean,
  ): TaskExecutionResult {
    if (!state.currentTask) {
      throw new BadRequestException('Cannot record task result without a selected task');
    }

    return {
      taskId: state.currentTask.id,
      title: state.currentTask.title,
      success,
      attempts: state.currentTaskAttempts,
      changedFiles: state.currentTaskChangedFiles,
      syntaxResult: state.currentTaskSyntaxResult,
      e2eResult: state.currentTaskE2EResult,
    };
  }

  private areDependenciesSatisfied(
    dependsOn: string[],
    completedTasks: TaskExecutionResult[],
  ) {
    const successfulTaskIds = new Set(
      completedTasks.filter((task) => task.success).map((task) => task.taskId),
    );
    return dependsOn.every((dependency) => successfulTaskIds.has(dependency));
  }

  private cleanEntities(entities: unknown[]): EntitySpec[] {
    return entities
      .flatMap((entity, index): EntitySpec[] => {
        const record =
          typeof entity === 'object' && entity !== null
            ? (entity as Record<string, unknown>)
            : {};
        const name =
          typeof record.name === 'string' && record.name.trim()
            ? record.name.trim()
            : undefined;

        if (!name) {
          return [];
        }

        return [{
          name,
          description:
            typeof record.description === 'string' ? record.description : undefined,
          fields: Array.isArray(record.fields)
            ? (record.fields as Array<Record<string, unknown>>)
            : [],
          relations: Array.isArray(record.relations)
            ? (record.relations as Array<Record<string, unknown>>)
            : [],
          endpoints: Array.isArray(record.endpoints)
            ? (record.endpoints as Array<Record<string, unknown>>)
            : [],
          businessRules: Array.isArray(record.businessRules)
            ? record.businessRules.filter((rule): rule is string => typeof rule === 'string')
            : [],
          source: { index, raw: record },
        }];
      });
  }

  private cleanPlannedFiles(files: Array<{ path?: string; purpose?: string }>) {
    return files
      .filter((file) => file.path && !this.isUnsafeGeneratedPath(file.path))
      .map((file) => ({
        path: file.path as string,
        purpose: file.purpose ?? 'Generated application file',
      }));
  }

  private cleanGeneratedFiles(files: GeneratedFile[]) {
    return files.filter(
      (file) =>
        file.path &&
        typeof file.content === 'string' &&
        !this.isUnsafeGeneratedPath(file.path),
    );
  }

  private isUnsafeGeneratedPath(filePath: string) {
    return (
      path.isAbsolute(filePath) ||
      filePath.includes('..') ||
      filePath.includes('node_modules/') ||
      filePath.endsWith('package-lock.json')
    );
  }

  private formatDocs(docs: MarkdownDocument[]) {
    return docs
      .map((doc) => [`# File: ${doc.path}`, doc.content].join('\n'))
      .join('\n\n---\n\n');
  }

  private summarizeErrors(results: BuildRunResult['commands']) {
    const failed = results.find((result) => !result.success);
    if (!failed) {
      return undefined;
    }

    return [
      `Command failed: ${failed.command}`,
      failed.stderr.trim(),
      failed.stdout.trim(),
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(-12_000);
  }

  private async readGeneratedFiles(outputDir: string): Promise<GeneratedFile[]> {
    const files = await this.workspace.listFiles(outputDir);
    const readable = files.filter(
      (file) =>
        !file.endsWith('.png') &&
        !file.endsWith('.jpg') &&
        !file.endsWith('.jpeg') &&
        !file.endsWith('.gif') &&
        !file.endsWith('.zip'),
    );

    const result: GeneratedFile[] = [];
    for (const file of readable) {
      const absolutePath = this.workspace.resolveInside(outputDir, file);
      result.push({
        path: file,
        content: await this.workspace.readTextFile(absolutePath),
      });
    }
    return result;
  }

  private mergeFiles(currentFiles: GeneratedFile[], changedFiles: GeneratedFile[]) {
    const merged = new Map(currentFiles.map((file) => [file.path, file]));
    for (const file of changedFiles) {
      merged.set(file.path, file);
    }
    return Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path));
  }
}
