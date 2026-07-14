import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceSnapshotBody } from './dto/workspace.dto';
import { Workspace } from './entities/workspace.entity';

const flowStepNames = ['Project', 'Planning', 'ERD', 'Operations', 'Generate', 'Test'];

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspacesRepository: Repository<Workspace>,
  ) {}

  async findAll(ownerId: string) {
    const workspaces = await this.workspacesRepository.find({
      where: { ownerId },
      order: { updatedAt: 'DESC' },
    });

    return workspaces.map((workspace) => this.toResponse(workspace));
  }

  async create(ownerId: string, body: WorkspaceSnapshotBody) {
    const workspace = this.workspacesRepository.create({
      ownerId,
      status: 'planning',
    });

    this.applySnapshot(workspace, body);

    return this.toResponse(await this.workspacesRepository.save(workspace));
  }

  async update(ownerId: string, workspaceId: string, body: WorkspaceSnapshotBody) {
    const workspace = await this.findOwnedWorkspace(ownerId, workspaceId);

    this.applySnapshot(workspace, body);

    return this.toResponse(await this.workspacesRepository.save(workspace));
  }

  async delete(ownerId: string, workspaceId: string) {
    const workspace = await this.findOwnedWorkspace(ownerId, workspaceId);

    await this.workspacesRepository.remove(workspace);

    return { ok: true };
  }

  private async findOwnedWorkspace(ownerId: string, workspaceId: string) {
    const workspace = await this.workspacesRepository.findOneBy({
      id: workspaceId,
      ownerId,
    });

    if (!workspace) {
      throw new NotFoundException('Workspace was not found.');
    }

    return workspace;
  }

  private applySnapshot(workspace: Workspace, body: WorkspaceSnapshotBody) {
    const draftProject = body.draftProject;

    workspace.draftProject = draftProject ?? workspace.draftProject ?? null;
    workspace.name = body.name ?? this.readString(draftProject, 'name') ?? workspace.name ?? 'Untitled workspace';
    workspace.description =
      body.description ?? this.readString(draftProject, 'description') ?? workspace.description ?? '';
    workspace.framework =
      body.framework ?? this.readString(draftProject, 'framework') ?? workspace.framework ?? 'NestJS';
    workspace.database =
      body.database ?? this.readString(draftProject, 'database') ?? workspace.database ?? 'PostgreSQL';
    workspace.flowStep = this.clampFlowStep(body.flowStep ?? workspace.flowStep ?? 0);
    workspace.currentStep =
      body.currentStep ?? flowStepNames[workspace.flowStep] ?? workspace.currentStep ?? 'Project';
    workspace.status = body.status ?? workspace.status ?? 'planning';
    workspace.generationWorkspaceId = body.workspaceId ?? workspace.generationWorkspaceId ?? null;
    workspace.generationWorkspacePath = body.workspacePath ?? workspace.generationWorkspacePath ?? null;
    workspace.nestJsAppPath = body.nestJsAppPath ?? workspace.nestJsAppPath ?? null;
    workspace.entities = body.entities ?? workspace.entities ?? null;
    workspace.relations = body.relations ?? workspace.relations ?? null;
    workspace.operations = body.operations ?? workspace.operations ?? null;
    workspace.generatedWorkspace = body.generatedWorkspace ?? workspace.generatedWorkspace ?? null;
    workspace.generatedNestResult = body.generatedNestResult ?? workspace.generatedNestResult ?? null;
    workspace.testAgentResult = body.testAgentResult ?? workspace.testAgentResult ?? null;
    workspace.entitiesCount = body.metrics?.entities ?? body.entities?.length ?? workspace.entitiesCount ?? 0;
    workspace.operationsCount =
      body.metrics?.operations ??
      body.operations?.filter((operation) => this.isEnabledOperation(operation)).length ??
      workspace.operationsCount ??
      0;
    workspace.testsCount = body.metrics?.tests ?? workspace.testsCount ?? 0;
    workspace.coverage = body.metrics?.coverage ?? workspace.coverage ?? null;
  }

  private toResponse(workspace: Workspace) {
    return {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      framework: workspace.framework,
      database: workspace.database,
      status: workspace.status,
      currentStep: workspace.currentStep,
      flowStep: workspace.flowStep,
      updatedAt: workspace.updatedAt.toISOString(),
      workspaceId: workspace.generationWorkspaceId ?? undefined,
      workspacePath: workspace.generationWorkspacePath ?? undefined,
      nestJsAppPath: workspace.nestJsAppPath ?? undefined,
      metrics: {
        entities: workspace.entitiesCount,
        operations: workspace.operationsCount,
        tests: workspace.testsCount,
        coverage: workspace.coverage ?? undefined,
      },
      draftProject: workspace.draftProject ?? undefined,
      entities: workspace.entities ?? undefined,
      relations: workspace.relations ?? undefined,
      operations: workspace.operations ?? undefined,
      generatedWorkspace: workspace.generatedWorkspace ?? undefined,
      generatedNestResult: workspace.generatedNestResult ?? undefined,
      testAgentResult: workspace.testAgentResult ?? undefined,
    };
  }

  private readString(value: unknown, key: string) {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const field = (value as Record<string, unknown>)[key];

    return typeof field === 'string' ? field : undefined;
  }

  private isEnabledOperation(operation: unknown) {
    return (
      Boolean(operation) &&
      typeof operation === 'object' &&
      (operation as Record<string, unknown>).enabled === true
    );
  }

  private clampFlowStep(flowStep: number) {
    return Math.min(Math.max(Math.trunc(flowStep), 0), flowStepNames.length - 1);
  }
}
