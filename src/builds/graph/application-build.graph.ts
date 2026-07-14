import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
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
import { CodePatchTool } from '../../tools/code-patch.tool';
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
  finalOutputDir: Annotation<string>(),
  docs: Annotation<MarkdownDocument[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  preservedUserFiles: Annotation<GeneratedFile[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  previousFiles: Annotation<GeneratedFile[]>({
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
  currentTaskAllChangedFiles: Annotation<string[]>({
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
  // Repair attempts spent on the FINAL app build, kept separate from the
  // bootstrap `repairAttempts` so bootstrap failures don't eat the final-build
  // budget (and vice-versa).
  finalRepairAttempts: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  finalContractsValidated: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
  dependenciesReady: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
});

type BuildStateType = typeof BuildState.State;

const INTERNAL_REPAIR_ATTEMPT_LIMIT = 8;
const APPLICATION_GRAPH_RECURSION_LIMIT = 700;
const TASK_REPAIR_ATTEMPT_LIMIT = 8;
const FINAL_BUILD_REPAIR_ATTEMPT_LIMIT = 8;

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
    const stagingDir = `${outputDir}.semraz-building-${process.pid}-${Date.now()}`;
    const preservedUserFiles = await this.collectUserOwnedFiles(outputDir);
    const previousFiles = await this.readPreservableFiles(outputDir);
    await fs.rm(stagingDir, { recursive: true, force: true });
    await fs.mkdir(stagingDir, { recursive: true });

    onProgress?.({
      stage: 'started',
      message: `Preparing ${request.target} output directory`,
      detail: { outputDir, stagingDir },
    });

    const graph = new StateGraph(BuildState)
      .addNode(
        'readDocs',
        this.withProgress(
          'Reading markdown design documents',
          this.readDocs.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'normalizeSpec',
        this.withProgress(
          'Normalizing application specification',
          this.normalizeSpec.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'planFiles',
        this.withProgress(
          'Planning NestJS bootstrap files',
          this.planFiles.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'generateFiles',
        this.withProgress(
          'Generating NestJS bootstrap files',
          this.generateFiles.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'writeFiles',
        this.withProgress(
          'Writing bootstrap files to workspace',
          this.writeFiles.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'runBuild',
        this.withProgress(
          'Installing dependencies and compiling bootstrap app',
          this.runBuild.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'repairFiles',
        this.withProgress(
          'Repairing bootstrap build failures',
          this.repairFiles.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'planBuildTasks',
        this.withProgress(
          'Planning entity, ORM, and CRUD tasks',
          this.planBuildTasks.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'restoreUserFiles',
        this.withProgress(
          'Restoring user-owned files into staging workspace',
          this.restoreUserFiles.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'selectNextTask',
        this.withProgress(
          'Selecting next generation task',
          this.selectNextTask.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'taskPlanner',
        this.withProgress(
          'Preparing selected task',
          this.taskPlanner.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'codeContext',
        this.withProgress(
          'Reading relevant generated code context',
          this.codeContext.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'codeGeneration',
        this.withProgress(
          'Generating task implementation files',
          this.codeGeneration.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'applyPatch',
        this.withProgress(
          'Applying generated file changes',
          this.applyPatch.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'syntaxCheck',
        this.withProgress(
          'Running TypeScript build check',
          this.syntaxCheck.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'e2eCheck',
        this.withProgress(
          'Running generated app verification gate',
          this.e2eCheck.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'recordCompletedTask',
        this.withProgress(
          'Recording completed task',
          this.recordCompletedTask.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'recordFailedTask',
        this.withProgress(
          'Recording failed task',
          this.recordFailedTask.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'runFinalBuild',
        this.withProgress(
          'Running final NestJS app build',
          this.runBuild.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'runFinalSmoke',
        this.withProgress(
          'Running final HTTP and Swagger smoke check',
          this.runFinalSmoke.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'validateFinalContracts',
        this.withProgress(
          'Validating final application against the specification skeleton',
          this.validateFinalContracts.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'repairFinalBuild',
        this.withProgress(
          'Repairing final build failures',
          this.repairFinalBuild.bind(this),
          onProgress,
        ),
      )
      .addNode(
        'packageArtifact',
        this.withProgress(
          'Collecting generated artifact summary',
          this.packageArtifact.bind(this),
          onProgress,
        ),
      )
      .addEdge(START, 'readDocs')
      .addEdge('readDocs', 'normalizeSpec')
      .addEdge('normalizeSpec', 'planFiles')
      .addEdge('planFiles', 'generateFiles')
      .addEdge('generateFiles', 'writeFiles')
      .addEdge('writeFiles', 'runBuild')
      .addConditionalEdges(
        'runBuild',
        (state) => this.nextAfterBootstrapBuild(state),
        {
          repairFiles: 'repairFiles',
          planBuildTasks: 'planBuildTasks',
          packageArtifact: 'packageArtifact',
        },
      )
      .addEdge('repairFiles', 'runBuild')
      .addEdge('planBuildTasks', 'restoreUserFiles')
      .addEdge('restoreUserFiles', 'selectNextTask')
      .addConditionalEdges(
        'selectNextTask',
        (state) => this.nextAfterSelectTask(state),
        {
          taskPlanner: 'taskPlanner',
          runFinalBuild: 'runFinalBuild',
        },
      )
      .addEdge('taskPlanner', 'codeContext')
      .addEdge('codeContext', 'codeGeneration')
      .addConditionalEdges(
        'codeGeneration',
        (state) => this.nextAfterCodeGeneration(state),
        {
          applyPatch: 'applyPatch',
          taskPlanner: 'taskPlanner',
          recordFailedTask: 'recordFailedTask',
        },
      )
      .addEdge('applyPatch', 'syntaxCheck')
      .addConditionalEdges(
        'syntaxCheck',
        (state) => this.nextAfterTaskSyntax(state),
        {
          taskPlanner: 'taskPlanner',
          e2eCheck: 'e2eCheck',
          recordFailedTask: 'recordFailedTask',
        },
      )
      .addConditionalEdges(
        'e2eCheck',
        (state) => this.nextAfterTaskE2E(state),
        {
          taskPlanner: 'taskPlanner',
          recordCompletedTask: 'recordCompletedTask',
          recordFailedTask: 'recordFailedTask',
        },
      )
      .addEdge('recordCompletedTask', 'selectNextTask')
      .addEdge('recordFailedTask', 'selectNextTask')
      .addConditionalEdges(
        'runFinalBuild',
        (state) => this.nextAfterFinalBuild(state),
        {
          repairFinalBuild: 'repairFinalBuild',
          runFinalSmoke: 'runFinalSmoke',
          packageArtifact: 'packageArtifact',
        },
      )
      .addConditionalEdges(
        'runFinalSmoke',
        (state) => this.nextAfterFinalVerification(state),
        {
          repairFinalBuild: 'repairFinalBuild',
          validateFinalContracts: 'validateFinalContracts',
          packageArtifact: 'packageArtifact',
        },
      )
      .addConditionalEdges(
        'validateFinalContracts',
        (state) => this.nextAfterFinalVerification(state),
        {
          repairFinalBuild: 'repairFinalBuild',
          validateFinalContracts: 'validateFinalContracts',
          packageArtifact: 'packageArtifact',
        },
      )
      .addEdge('repairFinalBuild', 'runFinalBuild')
      .addEdge('packageArtifact', END)
      .compile();

    let finalState: BuildStateType;
    try {
      finalState = await graph.invoke(
        {
          request,
          outputDir: stagingDir,
          finalOutputDir: outputDir,
          preservedUserFiles,
          previousFiles,
          repairAttempts: 0,
          finalRepairAttempts: 0,
          finalContractsValidated: false,
          dependenciesReady: false,
        },
        { recursionLimit: APPLICATION_GRAPH_RECURSION_LIMIT },
      );
      if (finalState.buildResult?.success) {
        await this.promoteStagingDirectory(stagingDir, outputDir);
        finalState = {
          ...finalState,
          outputDir,
          plan: finalState.plan
            ? { ...finalState.plan, rootDir: outputDir }
            : finalState.plan,
          artifact: finalState.artifact
            ? { ...finalState.artifact, outputDir }
            : finalState.artifact,
        };
      } else {
        await fs.rm(stagingDir, { recursive: true, force: true });
        const files = await this.safeListFiles(outputDir);
        finalState = {
          ...finalState,
          outputDir,
          plan: finalState.plan
            ? { ...finalState.plan, rootDir: outputDir }
            : finalState.plan,
          artifact: { outputDir, fileCount: files.length, files },
        };
      }
    } catch (error) {
      await fs.rm(stagingDir, { recursive: true, force: true });
      throw error;
    }

    if (
      !finalState.spec ||
      !finalState.plan ||
      !finalState.buildResult ||
      !finalState.artifact
    ) {
      throw new BadRequestException(
        'Build graph finished without required state',
      );
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
      finalRepairAttempts: finalState.finalRepairAttempts,
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
      const taskDetail = this.progressTaskDetail(state);
      onProgress?.({ stage: 'started', message, detail: taskDetail });
      try {
        const result = await node(state);
        const failed = this.nodeResultFailed(result);
        onProgress?.({
          stage: failed ? 'failed' : 'completed',
          message,
          detail: failed
            ? { ...taskDetail, error: this.nodeResultError(result) }
            : taskDetail,
        });
        return result;
      } catch (error) {
        onProgress?.({
          stage: 'failed',
          message,
          detail: {
            ...taskDetail,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
        throw error;
      }
    };
  }

  private progressTaskDetail(
    state: BuildStateType,
  ): Record<string, unknown> | undefined {
    if (!state.currentTask) {
      return undefined;
    }

    return {
      taskId: state.currentTask.id,
      taskKind: state.currentTask.kind,
      targetEntity: state.currentTask.targetEntity,
    };
  }

  private async normalizeRequest(
    dto: BuildRequestDto,
  ): Promise<NormalizedBuildRequest> {
    const projectDir = this.workspace.resolveProjectDir(dto.projectDir);
    const outputName =
      dto.outputName ??
      `${dto.target}-${new Date().toISOString().replace(/[:.]/g, '-').toLowerCase()}`;

    return {
      target: dto.target,
      projectDir,
      outputName,
      workspaceId: dto.workspaceId,
    };
  }

  private async readDocs(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    const docFiles = await this.findMarkdownFiles(state.request.projectDir);
    const docs: MarkdownDocument[] = [];

    for (const docFile of docFiles) {
      const absolutePath = this.workspace.resolveInside(
        state.request.projectDir,
        docFile,
      );
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

  private async normalizeSpec(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    // The LLM normalizes the spec from the markdown docs; the deterministic
    // markdown parser is only a fallback when the LLM output is unusable.
    try {
      const rawSpec = await this.normalizeDocsMapReduce(state);

      const llmEntities = this.cleanEntities(rawSpec.entities ?? []);
      if (llmEntities.length > 0) {
        const docsByPath = new Map(
          state.docs.map((doc) => [
            path.basename(doc.path).toLowerCase(),
            doc.content,
          ]),
        );
        const parsedEntities = this.parseErdEntities(
          docsByPath.get('erd.md') ?? '',
        );
        const entities =
          parsedEntities.length > 0
            ? parsedEntities.map((parsed) => {
                const llmEntity = llmEntities.find(
                  (candidate) =>
                    this.normalizeName(candidate.name) ===
                    this.normalizeName(parsed.name),
                );
                return {
                  ...llmEntity,
                  ...parsed,
                  description: llmEntity?.description,
                  businessRules: llmEntity?.businessRules ?? [],
                };
              })
            : llmEntities;
        const parsedEndpoints = this.parseEndpointRows(
          docsByPath.get('endpoints.md') ?? '',
        );
        const endpoints =
          parsedEndpoints.length > 0
            ? parsedEndpoints
            : Array.isArray(rawSpec.endpoints)
              ? rawSpec.endpoints
              : [];
        const endpointsByEntity = this.groupEndpointsByEntity(
          endpoints,
          entities,
        );

        return {
          spec: {
            projectName: rawSpec.projectName ?? state.request.outputName,
            summary: rawSpec.summary ?? '',
            entities: entities.map((entity) => ({
              ...entity,
              endpoints:
                parsedEndpoints.length > 0
                  ? (endpointsByEntity.get(entity.name) ?? [])
                  : entity.endpoints,
            })),
            endpoints,
            auth: rawSpec.auth ?? {},
            database: rawSpec.database ?? {},
            businessRules: Array.isArray(rawSpec.businessRules)
              ? rawSpec.businessRules
              : [],
            assumptions: Array.isArray(rawSpec.assumptions)
              ? rawSpec.assumptions
              : [],
          },
        };
      }
    } catch {
      // fall through to the deterministic parser
    }

    return { spec: this.parseMarkdownSpec(state) };
  }

  private async normalizeDocsMapReduce(
    state: BuildStateType,
  ): Promise<AppSpec> {
    const shards = this.markdownShards(state.docs, 24_000);
    const partials = await this.mapWithConcurrency(shards, 3, (docs, index) =>
      this.llm.generateJson<AppSpec>({
        system:
          'You convert product and engineering markdown documents into a strict JSON application specification. Return JSON only.',
        user: [
          `Map shard ${index + 1}/${shards.length}. Normalize only facts present in this shard.`,
          'Required JSON keys: projectName, summary, entities, endpoints, auth, database, businessRules, assumptions.',
          'Each entity must include name, fields, relations, endpoints, businessRules.',
          'Use arrays for entities, endpoints, businessRules, assumptions, fields, and relations.',
          'Entity field shape: {"name":string,"type":string,"required":boolean}; preserve declared names and types.',
          'Do not invent entities, fields, relations, or endpoints; put uncertainty in assumptions.',
          '',
          this.formatDocs(docs),
        ].join('\n'),
        temperature: 0.05,
        context: {
          workspaceId: state.request.workspaceId,
          caller: `build-graph:normalize-spec:map-${index + 1}`,
        },
      }),
    );
    return this.reducePartialSpecs(partials, state.request.outputName);
  }

  private markdownShards(
    docs: MarkdownDocument[],
    maxChars: number,
  ): MarkdownDocument[][] {
    const fragments = docs.flatMap((doc) => {
      if (doc.content.length <= maxChars) return [doc];
      const parts: MarkdownDocument[] = [];
      for (let offset = 0; offset < doc.content.length; offset += maxChars) {
        parts.push({
          path: `${doc.path}#part-${Math.floor(offset / maxChars) + 1}`,
          content: doc.content.slice(offset, offset + maxChars),
        });
      }
      return parts;
    });
    const shards: MarkdownDocument[][] = [];
    let current: MarkdownDocument[] = [];
    let size = 0;
    for (const fragment of fragments) {
      if (current.length > 0 && size + fragment.content.length > maxChars) {
        shards.push(current);
        current = [];
        size = 0;
      }
      current.push(fragment);
      size += fragment.content.length;
    }
    if (current.length > 0) shards.push(current);
    return shards.length > 0 ? shards : [[]];
  }

  private reducePartialSpecs(
    partials: AppSpec[],
    fallbackName: string,
  ): AppSpec {
    const entities = new Map<string, EntitySpec>();
    const mergeRecords = (
      left: Array<Record<string, unknown>>,
      right: Array<Record<string, unknown>>,
    ) =>
      Array.from(
        new Map(
          [...left, ...right].map((item) => [JSON.stringify(item), item]),
        ).values(),
      );
    for (const partial of partials) {
      for (const entity of this.cleanEntities(partial.entities ?? [])) {
        const key = this.normalizeName(entity.name);
        const existing = entities.get(key);
        entities.set(
          key,
          existing
            ? {
                ...existing,
                description: existing.description ?? entity.description,
                fields: mergeRecords(existing.fields, entity.fields),
                relations: mergeRecords(existing.relations, entity.relations),
                endpoints: mergeRecords(existing.endpoints, entity.endpoints),
                businessRules: [
                  ...new Set([
                    ...existing.businessRules,
                    ...entity.businessRules,
                  ]),
                ],
              }
            : entity,
        );
      }
    }
    const endpoints = mergeRecords(
      [],
      partials.flatMap((partial) => partial.endpoints ?? []),
    );
    return {
      projectName:
        partials.find((partial) => partial.projectName)?.projectName ??
        fallbackName,
      summary: partials.find((partial) => partial.summary)?.summary ?? '',
      entities: [...entities.values()],
      endpoints,
      auth: Object.assign({}, ...partials.map((partial) => partial.auth ?? {})),
      database: Object.assign(
        {},
        ...partials.map((partial) => partial.database ?? {}),
      ),
      businessRules: [
        ...new Set(partials.flatMap((partial) => partial.businessRules ?? [])),
      ],
      assumptions: [
        ...new Set(partials.flatMap((partial) => partial.assumptions ?? [])),
      ],
    };
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (next < items.length) {
          const index = next++;
          results[index] = await mapper(items[index], index);
        }
      },
    );
    await Promise.all(workers);
    return results;
  }

  private parseMarkdownSpec(state: BuildStateType): AppSpec {
    const docsByPath = new Map(
      state.docs.map((doc) => [
        path.basename(doc.path).toLowerCase(),
        doc.content,
      ]),
    );
    const projectDoc =
      docsByPath.get('project.md') ?? state.docs[0]?.content ?? '';
    const erdDoc = docsByPath.get('erd.md') ?? '';
    const endpointsDoc = docsByPath.get('endpoints.md') ?? '';
    const rulesDoc = docsByPath.get('rules.md') ?? '';
    const entities = this.parseErdEntities(erdDoc);
    const endpoints = this.parseEndpointRows(endpointsDoc);
    const endpointsByEntity = this.groupEndpointsByEntity(endpoints, entities);

    return {
      projectName:
        this.firstMarkdownHeading(projectDoc) ?? state.request.outputName,
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
      /^##\s+Entity:\s+(.+?)\s*$(?<body>[\s\S]*?)(?=^##\s+Entity:\s+|^##\s+Relationships\s*$|(?![\s\S]))/gm;
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

    for (const [relationIndex, line] of relationshipLines.entries()) {
      const relation = line.replace(/^-\s+/, '').trim();
      const relationMatch = relation.match(/^(.+?)\s+(1:N|N:1|1:1)\s+(.+)$/);
      if (!relationMatch) {
        continue;
      }

      const from = relationMatch[1].trim();
      const cardinality = relationMatch[2];
      const to = relationMatch[3]
        .replace(/\s+\((?:one|two)-way\)\s*$/i, '')
        .trim();
      relationMap.get(from)?.push({
        relationId: `erd-relation-${relationIndex + 1}`,
        source: from,
        target: to,
        cardinality,
        kind:
          cardinality === '1:N'
            ? 'one-to-many'
            : cardinality === 'N:1'
              ? 'many-to-one'
              : 'one-to-one',
      });
      relationMap.get(to)?.push({
        relationId: `erd-relation-${relationIndex + 1}`,
        source: to,
        target: from,
        cardinality:
          cardinality === '1:N' ? 'N:1' : cardinality === 'N:1' ? '1:N' : '1:1',
        kind:
          cardinality === '1:N'
            ? 'many-to-one'
            : cardinality === 'N:1'
              ? 'one-to-many'
              : 'one-to-one',
      });
    }

    return entities.map((entity) => ({
      ...entity,
      relations: relationMap.get(entity.name) ?? [],
    }));
  }

  private parseMarkdownTable(section: string): Array<Record<string, unknown>> {
    const rows = section
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('|') && line.endsWith('|'))
      .map((line) =>
        line
          .slice(1, -1)
          .split('|')
          .map((cell) => cell.trim()),
      );

    const header = rows[0] ?? [];
    const bodyRows = rows
      .slice(1)
      .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
    const columnIndex = (names: string[], fallback: number) => {
      const normalizedNames = names.map((name) => this.normalizeName(name));
      const index = header.findIndex((cell) =>
        normalizedNames.includes(this.normalizeName(cell)),
      );
      return index >= 0 ? index : fallback;
    };
    const nameIndex = columnIndex(['name', 'column', 'field'], 0);
    const typeIndex = columnIndex(['type', 'data type'], 1);
    const requiredIndex = columnIndex(['required', 'nn', 'not null'], 2);
    const notesIndex = columnIndex(['notes', 'description', 'references'], 3);

    return bodyRows
      .map((cells) => {
        const name = cells[nameIndex];
        const type = cells[typeIndex];
        const required = cells[requiredIndex];
        const notes = cells[notesIndex];
        return {
          name,
          type,
          required: /^(yes|true|y)$/i.test(required ?? ''),
          notes,
        };
      })
      .filter(
        (field) => typeof field.name === 'string' && field.name.length > 0,
      );
  }

  private parseEndpointRows(
    endpointsDoc: string,
  ): Array<Record<string, unknown>> {
    const endpoints: Array<Record<string, unknown>> = [];
    let section = '';
    let operationName = '';
    let currentEndpoint: Record<string, unknown> | undefined;
    let detailSection:
      | 'implementationRequirements'
      | 'requestFields'
      | 'responseFields'
      | undefined;

    for (const rawLine of endpointsDoc.split('\n')) {
      const line = rawLine.trim();
      const heading = line.match(/^##\s+(.+?)\s*$/);
      if (heading) {
        section = heading[1].trim();
        currentEndpoint = undefined;
        detailSection = undefined;
        continue;
      }

      const operationHeading = line.match(/^###\s+(.+?)\s*$/);
      if (operationHeading) {
        operationName = operationHeading[1].trim();
        currentEndpoint = undefined;
        detailSection = undefined;
        continue;
      }

      if (/^####\s+Request Fields\s*$/i.test(line)) {
        detailSection = 'requestFields';
        continue;
      }

      if (/^####\s+Implementation Requirements\s*$/i.test(line)) {
        detailSection = 'implementationRequirements';
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

      const endpoint = line
        .replace(/^[-*]\s+/, '')
        .replace(/^\*\*(GET|POST|PATCH|PUT|DELETE)\*\*/i, '$1')
        .replace(/`/g, '')
        .match(
          /^(GET|POST|PATCH|PUT|DELETE)\s+([^\s|]+)(?:\s*(?:[-–—:]\s*)?(.*))?$/i,
        );
      if (endpoint) {
        currentEndpoint = {
          section,
          operationName,
          method: endpoint[1].toUpperCase(),
          path: endpoint[2].trim(),
          description: endpoint[3]?.trim() ?? '',
          implementationRequirements: '',
          requestFields: [],
          responseFields: [],
        };
        endpoints.push(currentEndpoint);
        detailSection = undefined;
        continue;
      }

      const field = line.match(/^-\s+([^:]+):\s+(.+?)\s*$/);
      if (
        currentEndpoint &&
        detailSection &&
        detailSection !== 'implementationRequirements' &&
        field
      ) {
        const fields = currentEndpoint[detailSection];
        if (Array.isArray(fields)) {
          fields.push({
            name: field[1].trim(),
            type: field[2].trim(),
          });
        }
      }

      if (currentEndpoint && detailSection === 'implementationRequirements') {
        const trimmed = line.trim();
        if (trimmed && trimmed !== '-') {
          const existing =
            typeof currentEndpoint.implementationRequirements === 'string'
              ? currentEndpoint.implementationRequirements
              : '';
          currentEndpoint.implementationRequirements = existing
            ? `${existing}\n${trimmed.replace(/^-\s+/, '')}`
            : trimmed.replace(/^-\s+/, '');
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
      entities.flatMap((entity) => [
        [this.normalizeName(entity.name), entity.name],
        [this.normalizeName(this.pluralizeLabel(entity.name)), entity.name],
      ]),
    );
    const routeCandidates = entities.flatMap((entity) => {
      const singular = this.toKebabCase(entity.name);
      const plural = this.toKebabCase(this.pluralizeLabel(entity.name));
      return [
        { prefix: `/api/${singular}`, entityName: entity.name },
        { prefix: `/${singular}`, entityName: entity.name },
        { prefix: `/api/${plural}`, entityName: entity.name },
        { prefix: `/${plural}`, entityName: entity.name },
      ];
    });

    for (const endpoint of endpoints) {
      const section =
        typeof endpoint.section === 'string' ? endpoint.section : '';
      const path = typeof endpoint.path === 'string' ? endpoint.path : '';
      const normalizedPath = path
        .trim()
        .replace(/\{([^}]+)\}/g, ':$1')
        .replace(/\/+$/, '')
        .replace(/^([^/])/, '/$1');
      const pathEntityName = routeCandidates
        .sort((left, right) => right.prefix.length - left.prefix.length)
        .find(
          (candidate) =>
            normalizedPath === candidate.prefix ||
            normalizedPath.startsWith(`${candidate.prefix}/`),
        )?.entityName;
      const entityName =
        pathEntityName ?? entityBySection.get(this.normalizeName(section));
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
    return (
      markdown.match(
        new RegExp(
          `^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`,
          'm',
        ),
      )?.[1] ?? ''
    );
  }

  private normalizeName(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private toKebabCase(value: string) {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  private pluralizeLabel(value: string) {
    if (/metric$/i.test(value)) {
      return `${value}s`;
    }
    if (value.endsWith('y')) {
      return `${value.slice(0, -1)}ies`;
    }
    return `${value}s`;
  }

  private async planFiles(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    if (!state.spec) {
      throw new BadRequestException(
        'Cannot plan files without a normalized spec',
      );
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

  private async generateFiles(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    if (!state.spec || !state.plan) {
      throw new BadRequestException(
        'Cannot generate files without spec and file plan',
      );
    }

    const adapter = this.targetAdapters.get(state.request.target);
    return { generatedFiles: adapter.bootstrapFiles(state.spec) };
  }

  private async planBuildTasks(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    if (!state.spec) {
      throw new BadRequestException(
        'Cannot plan build tasks without a normalized spec',
      );
    }

    const adapter = this.targetAdapters.get(state.request.target);
    return {
      buildPlan: await this.backendPlannerAgent.plan(
        state.spec,
        adapter,
        state.request.workspaceId,
      ),
    };
  }

  private async restoreUserFiles(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    const generatedPaths = new Set([
      ...(state.plan?.files.map((file) => file.path) ?? []),
      ...state.buildPlan.tasks.flatMap((task) => task.allowedFiles),
    ]);
    const customFiles = state.previousFiles.filter(
      (file) => !generatedPaths.has(file.path),
    );
    await this.workspace.writeFiles(state.outputDir, customFiles);
    return {};
  }

  private async selectNextTask(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    const completedTaskIds = new Set(
      state.completedTasks.map((task) => task.taskId),
    );
    const eligibleTasks = state.buildPlan.tasks.filter(
      (task) =>
        !completedTaskIds.has(task.id) &&
        this.areDependenciesSatisfied(task.dependsOn, state.completedTasks),
    );
    const nextTask =
      eligibleTasks.length > 1
        ? await this.chooseNextTaskWithLlm(state, eligibleTasks)
        : eligibleTasks[0];

    if (!nextTask) {
      const hasRemainingTasks = state.buildPlan.tasks.some(
        (task) => !completedTaskIds.has(task.id),
      );
      if (hasRemainingTasks) {
        const blocked = state.buildPlan.tasks.filter(
          (task) => !completedTaskIds.has(task.id),
        );
        return {
          completedTasks: blocked.map((task) => ({
            taskId: task.id,
            title: task.title,
            success: false,
            attempts: 0,
            changedFiles: [],
            syntaxResult: {
              success: false,
              commands: [],
              errorSummary:
                'Task was blocked because one or more dependencies failed.',
            },
          })),
          currentTask: undefined,
          hasCurrentTask: false,
          currentTaskAllChangedFiles: [],
        };
      }

      return {
        currentTask: undefined,
        hasCurrentTask: false,
        currentEntity: undefined,
        currentContext: undefined,
        currentTaskGeneratedFiles: [],
        currentTaskChangedFiles: [],
        currentTaskAllChangedFiles: [],
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
        ? state.spec?.entities.find(
            (entity) => entity.name === nextTask.targetEntity,
          )
        : undefined,
      currentContext: undefined,
      currentTaskGeneratedFiles: [],
      currentTaskChangedFiles: [],
      currentTaskAllChangedFiles: [],
      currentTaskSyntaxResult: undefined,
      currentTaskE2EResult: undefined,
      currentTaskFailures: [],
      currentTaskAttempts: 0,
    };
  }

  private async chooseNextTaskWithLlm(
    state: BuildStateType,
    eligibleTasks: BuildTask[],
  ): Promise<BuildTask> {
    try {
      const result = await this.llm.generateJson<{ nextTaskId: string }>({
        system:
          'You are a build orchestrator that picks the next task to execute. Return JSON only with shape {"nextTaskId": string}.',
        user: [
          'Pick the single best next task to execute for this backend build.',
          'Prefer the task whose output unblocks the most remaining work and whose prerequisites are most complete in the generated code so far.',
          'nextTaskId must be one of the eligible task ids.',
          '',
          'Eligible tasks:',
          JSON.stringify(
            eligibleTasks.map((task) => ({
              id: task.id,
              kind: task.kind,
              title: task.title,
              dependsOn: task.dependsOn,
            })),
            null,
            2,
          ),
          '',
          'Completed tasks so far:',
          JSON.stringify(
            state.completedTasks.map((task) => ({
              taskId: task.taskId,
              success: task.success,
              attempts: task.attempts,
            })),
            null,
            2,
          ),
        ].join('\n'),
        temperature: 0,
        context: {
          workspaceId: state.request.workspaceId,
          caller: 'build-graph:select-task',
        },
      });

      const chosen = eligibleTasks.find(
        (task) => task.id === result?.nextTaskId,
      );
      if (chosen) {
        return chosen;
      }
    } catch {
      // fall through to deterministic order
    }

    return eligibleTasks[0];
  }

  private async taskPlanner(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    if (!state.currentTask) {
      throw new BadRequestException(
        'Cannot plan task work without a selected task',
      );
    }

    return {
      currentTaskFailures: state.currentTaskFailures,
    };
  }

  private async codeContext(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    if (!state.currentTask) {
      throw new BadRequestException(
        'Cannot understand code without a selected task',
      );
    }

    const adapter = this.targetAdapters.get(state.request.target);
    const currentContext = await this.codeContextAgent.understand({
      rootDir: state.outputDir,
      entity: state.currentEntity,
      task: state.currentTask,
      adapter,
      previousFailures: state.currentTaskFailures,
      workspaceId: state.request.workspaceId,
    });
    const preservedForTask = state.preservedUserFiles.filter((file) =>
      state.currentTask?.allowedFiles.includes(file.path),
    );
    for (const preserved of preservedForTask) {
      const existing = currentContext.fileContents.find(
        (file) => file.path === preserved.path,
      );
      if (existing) {
        existing.content = this.mergePreservedUserBlocks(
          existing.content,
          preserved.content,
        );
      } else {
        currentContext.fileContents.push(preserved);
      }
    }
    currentContext.relevantFiles = Array.from(
      new Set([
        ...currentContext.relevantFiles,
        ...preservedForTask.map((file) => file.path),
      ]),
    );
    return { currentContext };
  }

  private async codeGeneration(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    if (!state.spec || !state.currentTask || !state.currentContext) {
      throw new BadRequestException(
        'Cannot generate task code without spec, selected task, and code context',
      );
    }

    const adapter = this.targetAdapters.get(state.request.target);
    try {
      const currentTaskGeneratedFiles =
        await this.codeGenerationAgent.generateTaskFiles({
          spec: state.spec,
          task: state.currentTask,
          context: state.currentContext,
          adapter,
          workspaceId: state.request.workspaceId,
        });
      return {
        currentTaskGeneratedFiles,
        currentTaskFailures: [],
        currentTaskAttempts: state.currentTaskAttempts + 1,
      };
    } catch (error) {
      const failure: BuildRunResult = {
        success: false,
        commands: [],
        errorSummary:
          error instanceof Error ? error.message : 'Code generation failed',
      };
      return {
        currentTaskGeneratedFiles: [],
        currentTaskFailures: [failure],
        currentTaskSyntaxResult: failure,
        currentTaskAttempts: state.currentTaskAttempts + 1,
      };
    }
  }

  private async applyPatch(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    const adapter = this.targetAdapters.get(state.request.target);
    const currentTaskChangedFiles =
      await this.codePatchTool.applyFileReplacements(
        state.outputDir,
        state.currentTaskGeneratedFiles,
        adapter,
      );
    return {
      currentTaskChangedFiles,
      currentTaskAllChangedFiles: Array.from(
        new Set([
          ...state.currentTaskAllChangedFiles,
          ...currentTaskChangedFiles,
        ]),
      ).sort(),
    };
  }

  private async syntaxCheck(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
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

  private async e2eCheck(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    const adapter = this.targetAdapters.get(state.request.target);
    const currentTaskE2EResult = await this.e2eCheckAgent.check(
      state.outputDir,
      adapter,
    );
    return {
      currentTaskE2EResult,
      currentTaskFailures: currentTaskE2EResult.success
        ? []
        : [currentTaskE2EResult],
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
      currentTaskAllChangedFiles: [],
      currentTaskSyntaxResult: undefined,
      currentTaskE2EResult: undefined,
      currentTaskFailures: [],
      currentTaskAttempts: 0,
    };
  }

  private async recordFailedTask(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    return {
      completedTasks: [this.currentTaskResult(state, false)],
      currentTask: undefined,
      hasCurrentTask: false,
    };
  }

  private async writeFiles(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    await fs.mkdir(state.outputDir, { recursive: true });
    await this.workspace.writeFiles(state.outputDir, state.generatedFiles);
    for (const preserved of state.preservedUserFiles) {
      const generated = state.generatedFiles.find(
        (file) => file.path === preserved.path,
      );
      if (!generated) continue;
      await this.workspace.writeFiles(state.outputDir, [
        {
          path: generated.path,
          content: this.mergePreservedUserBlocks(
            generated.content,
            preserved.content,
          ),
        },
      ]);
    }
    return {};
  }

  private async runBuild(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    if (!state.plan) {
      throw new BadRequestException('Cannot run build without a file plan');
    }

    const includeInstall = !state.dependenciesReady;
    const installCommands = includeInstall ? state.plan.installCommands : [];
    const commands = [...installCommands, ...state.plan.buildCommands];

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
    const dependenciesReady =
      state.dependenciesReady ||
      (includeInstall &&
        (installCommands.length === 0 ||
          results
            .slice(0, installCommands.length)
            .every((result) => result.success)));

    return {
      dependenciesReady,
      buildResult: {
        success,
        commands: results,
        errorSummary: success ? undefined : this.summarizeErrors(results),
      },
      finalContractsValidated: false,
    };
  }

  private async runFinalSmoke(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    const adapter = this.targetAdapters.get(state.request.target);
    const commands = adapter.e2eCheckCommands();
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

  private async validateFinalContracts(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    if (!state.spec) {
      throw new BadRequestException('Cannot validate final app without spec');
    }
    const adapter = this.targetAdapters.get(state.request.target);
    const files = await this.readApplicationContractFiles(state.outputDir);
    const problems =
      adapter.validateApplicationFiles?.({
        spec: state.spec,
        files,
      }) ?? [];
    return {
      buildResult: {
        success: problems.length === 0,
        commands: state.buildResult?.commands ?? [],
        errorSummary: problems.length
          ? `Final specification contract failed:\n${problems.join('\n')}`
          : undefined,
      },
      finalContractsValidated: problems.length === 0,
    };
  }

  private async repairFiles(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    if (!state.spec || !state.plan || !state.buildResult) {
      throw new BadRequestException(
        'Cannot repair without spec, plan, and build result',
      );
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
      context: {
        workspaceId: state.request.workspaceId,
        caller: 'build-graph:repair-files',
      },
    });

    const adapter = this.targetAdapters.get(state.request.target);
    const plannedPaths = new Set(state.plan.files.map((file) => file.path));
    const files = adapter
      .normalizeGeneratedFiles(
        this.cleanGeneratedFiles(repaired.files ?? []).filter((file) =>
          plannedPaths.has(file.path),
        ),
      )
      .filter((file) => {
        const existing = currentFiles.find(
          (candidate) => candidate.path === file.path,
        )?.content;
        return (
          !existing || this.preservesUserCodeBlocks(existing, file.content)
        );
      });
    await this.workspace.writeFiles(state.outputDir, files);

    return {
      generatedFiles: this.mergeFiles(currentFiles, files),
      repairAttempts: state.repairAttempts + 1,
    };
  }

  private async repairFinalBuild(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    if (!state.spec || !state.plan || !state.buildResult) {
      throw new BadRequestException(
        'Cannot repair the final build without spec, plan, and build result',
      );
    }

    const attempt = state.finalRepairAttempts + 1;
    const adapter = this.targetAdapters.get(state.request.target);
    const focusFiles = await this.collectFinalRepairFiles(
      state.outputDir,
      state.buildResult.errorSummary ?? '',
      adapter,
      state.request.workspaceId,
    );

    const repaired = await this.llm.generateJson<{ files: GeneratedFile[] }>({
      system:
        'You fix TypeScript/NestJS compile errors by returning complete replacement file contents. Return JSON only with shape {"files":[{"path","content"}]}.',
      user: [
        `Target framework: ${state.request.target}`,
        `Final-build repair attempt: ${attempt}`,
        'The generated app failed a build, runtime verification, or specification-contract check. Diagnose the errors below and return the FULL final content of every file you change.',
        'Return ONLY files that must change; never restate an unchanged file.',
        'A frequent cause is a relation whose inverse side is missing: `@ManyToOne(() => Other, (o) => o.things)` requires `things: Thing[]` with `@OneToMany(() => Thing, (t) => t.other)` on the Other entity. Add the missing inverse property (with decorator + import) to the target entity — do NOT delete the relation.',
        'Never remove entities, fields, endpoints, or features from the spec to make the build pass.',
        'Never add a controller route absent from the normalized endpoint skeleton.',
        'Preserve every // <semraz:user-code ...> block byte-for-byte.',
        '',
        'Build errors:',
        state.buildResult.errorSummary ?? 'Unknown build error',
        '',
        'Authoritative global endpoint skeleton (no other public routes are allowed):',
        JSON.stringify(
          state.spec.entities.flatMap((entity) => entity.endpoints),
          null,
          2,
        ),
        '',
        'Relevant files (each flagged file and the local files it imports):',
        JSON.stringify(focusFiles, null, 2),
      ].join('\n'),
      temperature: 0.05,
      context: {
        workspaceId: state.request.workspaceId,
        caller: `build-graph:repair-final:attempt-${attempt}`,
      },
    });

    const allowedPaths = new Set(focusFiles.map((file) => file.path));
    const files = adapter
      .normalizeGeneratedFiles(
        this.cleanGeneratedFiles(repaired.files ?? []).filter((file) =>
          allowedPaths.has(file.path),
        ),
      )
      .filter((file) => {
        const existing = focusFiles.find(
          (candidate) => candidate.path === file.path,
        )?.content;
        return (
          !existing || this.preservesUserCodeBlocks(existing, file.content)
        );
      });
    await this.workspace.writeFiles(state.outputDir, files);

    // The fix is now on disk; runFinalBuild re-reads from disk, so only the
    // attempt counter needs to advance in graph state.
    return { finalRepairAttempts: attempt, finalContractsValidated: false };
  }

  /**
   * Gathers the source the final-build repair actually needs: the files the
   * compiler flagged plus the local (relative-imported) files they depend on.
   * The fix for a dangling relation lives in the imported *target* entity, not
   * the flagged file, so one hop of imports is essential. Falls back to the full
   * source set when no file path can be parsed from the error output.
   */
  private async collectFinalRepairFiles(
    outputDir: string,
    errorSummary: string,
    adapter?: ReturnType<TargetAdapterRegistry['get']>,
    workspaceId?: string,
  ): Promise<GeneratedFile[]> {
    const flagged = this.extractErrorFilePaths(errorSummary);
    const wanted = new Set<string>(flagged);

    for (const relativePath of flagged) {
      for (const imported of await this.readLocalImports(
        outputDir,
        relativePath,
      )) {
        wanted.add(imported);
      }
    }

    const files: GeneratedFile[] = [];
    for (const relativePath of Array.from(wanted).slice(0, 40)) {
      try {
        const absolutePath = this.workspace.resolveInside(
          outputDir,
          relativePath,
        );
        files.push({
          path: relativePath,
          content: await this.workspace.readTextFile(absolutePath),
        });
      } catch {
        // Missing imported files are valid repair targets. An empty content
        // placeholder keeps the path in allowedPaths so the repair can create it.
        files.push({ path: relativePath, content: '' });
      }
    }

    if (files.length > 0) return files;
    if (adapter) {
      const context = await this.codeContextAgent.understand({
        rootDir: outputDir,
        task: {
          id: 'final-repair-context',
          kind: 'orm-registration',
          title: 'Select final repair context',
          description: errorSummary,
          dependsOn: [],
          allowedFiles: [],
          doneCriteria: [],
        },
        adapter,
        previousFailures: [{ success: false, commands: [], errorSummary }],
        workspaceId,
      });
      if (context.fileContents.length > 0) return context.fileContents;
    }
    return this.readGeneratedFiles(outputDir);
  }

  private extractErrorFilePaths(errorSummary: string): string[] {
    // eslint-disable-next-line no-control-regex
    const clean = errorSummary.replace(/\x1b\[[0-9;]*m/g, '');
    const paths = new Set<string>();
    const regex = /(src\/[\w./-]+\.ts)(?=[:\s)]|$)/gm;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(clean)) !== null) {
      paths.add(match[1]);
    }
    const configRegex =
      /(^|[\s(])(nest-cli\.json|package\.json|tsconfig(?:\.build)?\.json|\.env\.example)(?=[:\s)]|$)/gm;
    while ((match = configRegex.exec(clean)) !== null) {
      paths.add(match[2]);
    }
    return Array.from(paths);
  }

  private async readLocalImports(
    outputDir: string,
    relativePath: string,
  ): Promise<string[]> {
    let content: string;
    try {
      content = await this.workspace.readTextFile(
        this.workspace.resolveInside(outputDir, relativePath),
      );
    } catch {
      return [];
    }

    const dir = path.posix.dirname(relativePath);
    const results: string[] = [];
    const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const resolved = path.posix.normalize(path.posix.join(dir, match[1]));
      const candidate = resolved.endsWith('.ts') ? resolved : `${resolved}.ts`;
      if (candidate.startsWith('src/')) {
        results.push(candidate);
      }
    }
    return results;
  }

  private async packageArtifact(
    state: BuildStateType,
  ): Promise<Partial<BuildStateType>> {
    const files = await this.workspace.listFiles(state.outputDir);
    const failedTasks = state.completedTasks.filter((task) => !task.success);
    const taskFailureSummary = failedTasks.length
      ? `Build tasks failed or were blocked: ${failedTasks
          .map((task) => task.taskId)
          .join(', ')}`
      : undefined;
    return {
      buildResult: state.buildResult
        ? {
            ...state.buildResult,
            success: state.buildResult.success && failedTasks.length === 0,
            errorSummary:
              [state.buildResult.errorSummary, taskFailureSummary]
                .filter(Boolean)
                .join('\n\n') || undefined,
          }
        : undefined,
      completedEntities: this.summarizeCompletedEntities(state),
      artifact: {
        outputDir: state.outputDir,
        fileCount: files.length,
        files,
      },
    };
  }

  private summarizeCompletedEntities(
    state: BuildStateType,
  ): EntityImplementationResult[] {
    if (!state.spec) {
      return [];
    }
    const taskById = new Map(
      state.buildPlan.tasks.map((task) => [task.id, task]),
    );
    return state.spec.entities.map((entity) => {
      const entityPath = `src/${this.toKebabCase(entity.name)}/${this.toKebabCase(entity.name)}.entity.ts`;
      const results = state.completedTasks.filter((result) => {
        const task = taskById.get(result.taskId);
        return (
          task?.targetEntity === entity.name ||
          (task?.kind === 'entity-relations' &&
            task.allowedFiles.includes(entityPath)) ||
          task?.kind === 'orm-registration'
        );
      });
      const last = results.at(-1);
      return {
        entityName: entity.name,
        success:
          results.length > 0 && results.every((result) => result.success),
        attempts: results.reduce((total, result) => total + result.attempts, 0),
        changedFiles: Array.from(
          new Set(results.flatMap((result) => result.changedFiles)),
        ).sort(),
        syntaxResult: last?.syntaxResult,
        e2eResult: last?.e2eResult,
      };
    });
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

  private nextAfterSelectTask(
    state: BuildStateType,
  ): 'taskPlanner' | 'runFinalBuild' {
    return state.hasCurrentTask ? 'taskPlanner' : 'runFinalBuild';
  }

  private nextAfterFinalBuild(
    state: BuildStateType,
  ): 'repairFinalBuild' | 'runFinalSmoke' | 'packageArtifact' {
    if (state.buildResult?.success) {
      return 'runFinalSmoke';
    }

    // Give up after the budget is spent and package whatever compiled — the
    // response still reports success:false so the caller sees the failure.
    if (state.finalRepairAttempts >= FINAL_BUILD_REPAIR_ATTEMPT_LIMIT) {
      return 'packageArtifact';
    }

    return 'repairFinalBuild';
  }

  private nextAfterFinalVerification(
    state: BuildStateType,
  ): 'repairFinalBuild' | 'validateFinalContracts' | 'packageArtifact' {
    if (state.buildResult?.success) {
      return state.finalContractsValidated
        ? 'packageArtifact'
        : 'validateFinalContracts';
    }
    return state.finalRepairAttempts >= FINAL_BUILD_REPAIR_ATTEMPT_LIMIT
      ? 'packageArtifact'
      : 'repairFinalBuild';
  }

  private nextAfterCodeGeneration(
    state: BuildStateType,
  ): 'applyPatch' | 'taskPlanner' | 'recordFailedTask' {
    if (state.currentTaskGeneratedFiles.length > 0) return 'applyPatch';
    return state.currentTaskAttempts >= TASK_REPAIR_ATTEMPT_LIMIT
      ? 'recordFailedTask'
      : 'taskPlanner';
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
      throw new BadRequestException(
        'Cannot record task result without a selected task',
      );
    }

    return {
      taskId: state.currentTask.id,
      title: state.currentTask.title,
      success,
      attempts: state.currentTaskAttempts,
      changedFiles: state.currentTaskAllChangedFiles,
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
    return entities.flatMap((entity, index): EntitySpec[] => {
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

      return [
        {
          name,
          description:
            typeof record.description === 'string'
              ? record.description
              : undefined,
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
            ? record.businessRules.filter(
                (rule): rule is string => typeof rule === 'string',
              )
            : [],
          source: { index, raw: record },
        },
      ];
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

  private cleanGeneratedFiles(files: unknown): GeneratedFile[] {
    if (!Array.isArray(files)) {
      const received = files === null ? 'null' : typeof files;
      throw new InternalServerErrorException(
        `Invalid AI repair response: "files" must be an array (received ${received})`,
      );
    }

    return files.filter(
      (file): file is GeneratedFile =>
        typeof file === 'object' &&
        file !== null &&
        'path' in file &&
        'content' in file &&
        typeof file.path === 'string' &&
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

  private async collectUserOwnedFiles(
    outputDir: string,
  ): Promise<GeneratedFile[]> {
    try {
      const files = (await this.workspace.listFiles(outputDir)).filter((file) =>
        file.startsWith('src/'),
      );
      const preserved: GeneratedFile[] = [];
      for (const filePath of files) {
        const content = await this.workspace.readTextFile(
          this.workspace.resolveInside(outputDir, filePath),
        );
        const blocks = Array.from(
          content.matchAll(
            /\/\/\s*<semraz:user-code(?:\s+name="[^"]+")?>[\s\S]*?\/\/\s*<\/semraz:user-code>/g,
          ),
          (match) => match[0],
        );
        if (blocks.length > 0) {
          preserved.push({ path: filePath, content });
        }
      }
      return preserved;
    } catch {
      return [];
    }
  }

  private async readGeneratedFiles(
    outputDir: string,
    limit = 80,
    maxChars = 16_000,
  ): Promise<GeneratedFile[]> {
    const files = await this.workspace.listFiles(outputDir);
    const readable = files.filter(
      (file) =>
        !file.startsWith('dist/') &&
        !file.startsWith('coverage/') &&
        !file.startsWith('.git/') &&
        file !== 'package-lock.json' &&
        !file.endsWith('.png') &&
        !file.endsWith('.jpg') &&
        !file.endsWith('.jpeg') &&
        !file.endsWith('.gif') &&
        !file.endsWith('.zip'),
    );

    const result: GeneratedFile[] = [];
    for (const file of readable.slice(0, limit)) {
      const absolutePath = this.workspace.resolveInside(outputDir, file);
      result.push({
        path: file,
        content: (await this.workspace.readTextFile(absolutePath)).slice(
          0,
          maxChars,
        ),
      });
    }
    return result;
  }

  private async readApplicationContractFiles(
    outputDir: string,
  ): Promise<GeneratedFile[]> {
    const paths = (await this.workspace.listFiles(outputDir)).filter(
      (file) =>
        (file.startsWith('src/') && file.endsWith('.ts')) ||
        file === 'package.json' ||
        file === 'nest-cli.json' ||
        file === '.env.example',
    );
    const files: GeneratedFile[] = [];
    for (const filePath of paths) {
      files.push({
        path: filePath,
        content: await this.workspace.readTextFile(
          this.workspace.resolveInside(outputDir, filePath),
        ),
      });
    }
    return files;
  }

  private async readPreservableFiles(
    outputDir: string,
  ): Promise<GeneratedFile[]> {
    try {
      const paths = (await this.workspace.listFiles(outputDir)).filter(
        (file) =>
          !file.startsWith('dist/') &&
          !file.startsWith('coverage/') &&
          !file.startsWith('node_modules/') &&
          !file.startsWith('.git/') &&
          file !== 'package-lock.json',
      );
      const result: GeneratedFile[] = [];
      for (const filePath of paths) {
        try {
          result.push({
            path: filePath,
            content: await this.workspace.readTextFile(
              this.workspace.resolveInside(outputDir, filePath),
            ),
          });
        } catch {
          // Binary/unreadable files are outside source regeneration scope.
        }
      }
      return result;
    } catch {
      return [];
    }
  }

  private async safeListFiles(outputDir: string) {
    try {
      return await this.workspace.listFiles(outputDir);
    } catch {
      return [];
    }
  }

  private preservesUserCodeBlocks(existing: string, generated: string) {
    const blocks = Array.from(
      existing.matchAll(
        /\/\/\s*<semraz:user-code(?:\s+name="[^"]+")?>[\s\S]*?\/\/\s*<\/semraz:user-code>/g,
      ),
      (match) => match[0],
    );
    return blocks.every((block) => generated.includes(block));
  }

  private mergePreservedUserBlocks(
    generated: string,
    previous: string,
  ): string {
    const matches = Array.from(
      previous.matchAll(
        /\/\/\s*<semraz:user-code(?:\s+name="[^"]+")?>[\s\S]*?\/\/\s*<\/semraz:user-code>/g,
      ),
    );
    let result = generated;
    for (const match of matches) {
      const block = match[0];
      if (result.includes(block)) continue;
      const oldIndex = match.index ?? 0;
      const containingClass = this.classContainingOffset(previous, oldIndex);
      if (containingClass) {
        const classPattern = new RegExp(
          `export\\s+class\\s+${this.escapeRegExp(containingClass)}\\b[^\\{]*\\{`,
        );
        const classMatch = classPattern.exec(result);
        if (classMatch) {
          const open = result.indexOf('{', classMatch.index);
          const close = this.findMatchingBrace(result, open);
          if (close > open) {
            result = `${result.slice(0, close).trimEnd()}\n\n${block}\n${result.slice(close)}`;
            continue;
          }
        }
      }
      const firstClass = result.search(/export\s+class\s+\w+/);
      if (
        oldIndex < previous.search(/export\s+class\s+\w+/) &&
        firstClass >= 0
      ) {
        result = `${result.slice(0, firstClass)}${block}\n\n${result.slice(firstClass)}`;
      } else {
        result = `${result.trimEnd()}\n\n${block}\n`;
      }
    }
    return result;
  }

  private classContainingOffset(content: string, offset: number) {
    const regex = /export\s+class\s+(\w+)\b[^\{]*\{/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const open = content.indexOf('{', match.index);
      const close = this.findMatchingBrace(content, open);
      if (open < offset && offset < close) return match[1];
    }
    return undefined;
  }

  private findMatchingBrace(content: string, open: number) {
    let depth = 0;
    for (let index = open; index < content.length; index += 1) {
      if (content[index] === '{') depth += 1;
      if (content[index] === '}') depth -= 1;
      if (depth === 0) return index;
    }
    return -1;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async promoteStagingDirectory(stagingDir: string, outputDir: string) {
    const releaseLock = await this.acquirePromotionLock(outputDir);
    try {
      await this.promoteStagingDirectoryLocked(stagingDir, outputDir);
    } finally {
      await releaseLock();
    }
  }

  private async promoteStagingDirectoryLocked(
    stagingDir: string,
    outputDir: string,
  ) {
    const backupDir = `${outputDir}.semraz-backup-${process.pid}-${Date.now()}`;
    let movedExisting = false;
    try {
      try {
        await fs.rename(outputDir, backupDir);
        movedExisting = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await fs.rename(stagingDir, outputDir);
      if (movedExisting) {
        await fs.rm(backupDir, { recursive: true, force: true });
      }
    } catch (error) {
      if (movedExisting) {
        await fs.rm(outputDir, { recursive: true, force: true });
        await fs.rename(backupDir, outputDir);
      }
      throw error;
    }
  }

  private async acquirePromotionLock(outputDir: string) {
    const lockDir = `${outputDir}.semraz-promote-lock`;
    const deadline = Date.now() + 5 * 60_000;
    while (true) {
      try {
        await fs.mkdir(lockDir);
        return async () => fs.rm(lockDir, { recursive: true, force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        try {
          const stat = await fs.stat(lockDir);
          if (Date.now() - stat.mtimeMs > 10 * 60_000) {
            await fs.rm(lockDir, { recursive: true, force: true });
            continue;
          }
        } catch {
          continue;
        }
        if (Date.now() >= deadline) {
          throw new BadRequestException(
            `Timed out waiting to promote build output: ${outputDir}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  private nodeResultFailed(result: Partial<BuildStateType>) {
    const candidates = [
      result.buildResult,
      result.currentTaskSyntaxResult,
      result.currentTaskE2EResult,
      ...(result.currentTaskFailures ?? []),
    ];
    return candidates.some((candidate) => candidate?.success === false);
  }

  private nodeResultError(result: Partial<BuildStateType>) {
    return [
      result.buildResult,
      result.currentTaskSyntaxResult,
      result.currentTaskE2EResult,
      ...(result.currentTaskFailures ?? []),
    ].find((candidate) => candidate?.success === false)?.errorSummary;
  }

  private mergeFiles(
    currentFiles: GeneratedFile[],
    changedFiles: GeneratedFile[],
  ) {
    const merged = new Map(currentFiles.map((file) => [file.path, file]));
    for (const file of changedFiles) {
      merged.set(file.path, file);
    }
    return Array.from(merged.values()).sort((a, b) =>
      a.path.localeCompare(b.path),
    );
  }
}
