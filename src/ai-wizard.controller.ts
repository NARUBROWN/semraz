import {
  Body,
  Controller,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from './auth/guards/access-token.guard';
import type { AuthenticatedRequest } from './auth/auth.types';
import { OpenAiJsonClient } from './builds/llm/openai-json.client';
import {
  DesignConsistencyService,
  type DesignContract,
  type DesignOperation,
} from './design-consistency/design-consistency.service';

type AiWizardStep = 'project' | 'planning' | 'erd' | 'operations';

type AiWizardRequest = {
  step: AiWizardStep;
  language?: 'en' | 'ko';
  project?: Record<string, unknown>;
  entities?: Array<Record<string, unknown>>;
  relations?: Array<Record<string, unknown>>;
  operations?: Array<Record<string, unknown>>;
};

type AiWizardIssue = {
  code: string;
  location: string;
  message: string;
  suggestion: string;
};

type AiWizardRepairRequest = AiWizardRequest & {
  draft?: Record<string, unknown>;
  issues?: AiWizardIssue[];
};

@Controller('api/ai')
export class AiWizardController {
  constructor(
    private readonly llm: OpenAiJsonClient,
    private readonly designConsistency: DesignConsistencyService,
  ) {}

  @Post('wizard')
  @UseGuards(AccessTokenGuard)
  async generateWizardDraft(
    @Req() httpRequest: AuthenticatedRequest,
    @Body() request: AiWizardRequest,
  ) {
    const userId = httpRequest.auth?.sub;
    const includeCurrentState = request.step !== 'project';
    const currentState = buildCurrentState(request);

    const draft = await this.llm.generateJson({
      // Ideation benefits from more variation than implementation work. Code
      // generation continues to use OPENAI_MODEL (gpt-5-codex).
      model: 'gpt-4o-mini',
      system: [
        'You are Semraz AI Wizard, a senior backend architect for a design-first NestJS backend generator.',
        'Return only valid JSON. Do not include markdown fences.',
        'Use concise, implementation-ready names. Prefer uuid ids, camelCase fields, and explicit PK/NN/FK flags.',
        'Never include explanations outside the requested JSON shape.',
        'For every downstream stage, the confirmed upstream Semraz state is a contract: refine and implement it, but never add a product capability, data concept, integration, policy, or workflow that is not explicitly stated or strictly required to represent an explicitly stated capability.',
        'Do not infer common product features from convention. If a requirement cannot be traced to the confirmed contract, omit it rather than guessing.',
      ].join('\n'),
      user: [
        buildLanguageInstruction(request.language),
        '',
        buildStepInstruction(request.step),
        ...(includeCurrentState
          ? [
              '',
              'Confirmed upstream Semraz state. Treat this as source of truth:',
              JSON.stringify(currentState, null, 2),
            ]
          : []),
      ].join('\n'),
      temperature: request.step === 'project' ? 1.25 : 0.2,
      context: { userId, caller: `ai-wizard:${request.step}` },
    });

    if (request.step === 'project') {
      const report = this.designConsistency.validateTransition('project', {
        project: (draft as Record<string, unknown>).project as Record<
          string,
          unknown
        >,
      });
      if (!report.valid) {
        throw this.transitionException(
          'Project',
          report.issues,
          draft as Record<string, unknown>,
        );
      }
    }

    if (request.step === 'planning') {
      const report = this.designConsistency.validateTransition('planning', {
        project: {
          ...(request.project ?? {}),
          planning: (draft as Record<string, unknown>).planning,
        },
      });
      if (!report.valid) {
        throw this.transitionException(
          'Planning',
          report.issues,
          draft as Record<string, unknown>,
        );
      }
    }

    if (request.step === 'erd') {
      return this.validateAndRepairErdDraft(
        httpRequest,
        request,
        draft as Record<string, unknown>,
      );
    }

    if (request.step === 'operations') {
      return this.validateAndRepairOperationsDraft(
        httpRequest,
        request,
        draft as Record<string, unknown>,
      );
    }

    return draft;
  }

  @Post('repair')
  @UseGuards(AccessTokenGuard)
  async repairWizardDraft(
    @Req() httpRequest: AuthenticatedRequest,
    @Body() request: AiWizardRepairRequest,
  ) {
    const draft = isRecord(request.draft) ? request.draft : {};
    const issues = Array.isArray(request.issues) ? request.issues : [];

    if (request.step === 'erd') {
      let currentDraft = sanitizeErdDraft(draft);
      let report = this.designConsistency.validateTransition('erd', {
        project: request.project,
        entities: currentDraft.entities as DesignContract['entities'],
        relations: currentDraft.relations as DesignContract['relations'],
      });

      if (report.valid) return currentDraft;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        currentDraft = await this.requestErdRepair(
          httpRequest,
          request,
          currentDraft,
          report.issues,
          'ai-wizard:erd-user-repair',
        );
        report = this.designConsistency.validateTransition('erd', {
          project: request.project,
          entities: currentDraft.entities as DesignContract['entities'],
          relations: currentDraft.relations as DesignContract['relations'],
        });
        if (report.valid) return currentDraft;
      }

      throw this.transitionException('ERD', report.issues, currentDraft);
    }

    if (request.step === 'operations') {
      const repaired = await this.requestOperationsRepair(
        httpRequest,
        request,
        draft,
        issues,
        'ai-wizard:operations-user-repair',
      );
      const repairedContract = this.operationContract(request, repaired);
      const normalized = {
        ...repaired,
        operations: this.designConsistency.repairOperations(repairedContract),
      };
      const report = this.designConsistency.validateTransition(
        'operations',
        this.operationContract(request, normalized),
      );
      if (!report.valid) {
        throw this.transitionException('Operations', report.issues, normalized);
      }
      return normalized;
    }

    throw new UnprocessableEntityException({
      message: '현재 단계에서는 AI Repair를 사용할 수 없습니다.',
      issues,
      draft,
    });
  }

  @Post('validate-transition')
  @UseGuards(AccessTokenGuard)
  validateTransition(@Body() request: AiWizardRequest) {
    const contract: DesignContract = {
      project: request.project,
      entities: request.entities as DesignContract['entities'],
      relations: request.relations as DesignContract['relations'],
      operations: request.operations as DesignContract['operations'],
    };
    const report = this.designConsistency.validateTransition(
      request.step,
      contract,
    );
    if (!report.valid) {
      throw this.transitionException(request.step, report.issues);
    }
    return report;
  }

  private async validateAndRepairErdDraft(
    httpRequest: AuthenticatedRequest,
    request: AiWizardRequest,
    initialDraft: Record<string, unknown>,
  ) {
    let draft = sanitizeErdDraft(initialDraft);
    let report = this.designConsistency.validateTransition('erd', {
      project: request.project,
      entities: draft.entities as DesignContract['entities'],
      relations: draft.relations as DesignContract['relations'],
    });

    if (!report.valid) {
      draft = await this.requestErdRepair(
        httpRequest,
        request,
        draft,
        report.issues,
        'ai-wizard:erd-repair',
      );
      report = this.designConsistency.validateTransition('erd', {
        project: request.project,
        entities: draft.entities as DesignContract['entities'],
        relations: draft.relations as DesignContract['relations'],
      });
    }

    if (!report.valid) {
      throw this.transitionException('ERD', report.issues, draft);
    }
    return draft;
  }

  private async requestErdRepair(
    httpRequest: AuthenticatedRequest,
    request: AiWizardRequest,
    draft: Record<string, unknown>,
    issues: AiWizardIssue[],
    caller: string,
  ) {
    const repaired = await this.llm.generateJson<Record<string, unknown>>({
      model: 'gpt-4o-mini',
      system: [
        'You repair an ERD draft after deterministic cross-stage validation failed.',
        'Return JSON only with shape {"entities":ErdEntity[],"relations":ErdRelation[]}.',
        'Preserve the confirmed Project and Planning requirements.',
        'Resolve every reported coverage and structural issue without removing an upstream capability.',
        'Every entity needs exactly one uuid id primary key. Every foreign key needs an existing target entity and matching relation.',
        'Use a globally unique field id for every field. Prefix field ids with their owning entity id.',
        'Return at most one relation for each unordered entity pair. Never return both A-to-B and the reverse B-to-A form of the same relationship.',
        'For each relation, foreignKeyOwnerId and foreignKeyFieldName must identify the single owning uuid FK field.',
        'Preserve valid entity names, fields, ids, and canvas positions. Change only what is needed to resolve the supplied current validation log.',
      ].join('\n'),
      user: [
        buildLanguageInstruction(request.language),
        '',
        'Confirmed Project and Planning:',
        JSON.stringify(request.project, null, 2),
        '',
        'Rejected ERD:',
        JSON.stringify(draft, null, 2),
        '',
        'Fresh deterministic validation log for the current ERD above. Issue array locations refer to this exact draft:',
        JSON.stringify(issues, null, 2),
      ].join('\n'),
      temperature: 0,
      context: {
        userId: httpRequest.auth?.sub,
        caller,
      },
    });
    return sanitizeErdDraft(repaired);
  }

  private async validateAndRepairOperationsDraft(
    httpRequest: AuthenticatedRequest,
    request: AiWizardRequest,
    initialDraft: Record<string, unknown>,
  ) {
    let draft = initialDraft;
    const initialContract = this.operationContract(request, draft);
    const initialReport = this.designConsistency.validate(initialContract);
    if (!initialReport.valid) {
      draft = {
        ...draft,
        operations: this.designConsistency.repairOperations(initialContract),
      };
    }
    let report = this.designConsistency.validateTransition(
      'operations',
      this.operationContract(request, draft),
    );

    if (!report.valid) {
      if (
        report.issues.some(
          (issue) =>
            issue.code.startsWith('ERD_CAPABILITY_') ||
            issue.code.startsWith('PROJECT_') ||
            issue.code.startsWith('PLANNING_'),
        )
      ) {
        throw this.transitionException('Operations', report.issues);
      }
      console.warn(
        '[AiWizard] deterministic Operations repair needs LLM fallback:',
        report.issues.map((issue) => issue.code).join(', '),
      );
      draft = await this.requestOperationsRepair(
        httpRequest,
        request,
        draft,
        report.issues,
        'ai-wizard:operations-repair',
      );
      const repairedContract = this.operationContract(request, draft);
      draft = {
        ...draft,
        operations: this.designConsistency.repairOperations(repairedContract),
      };
      report = this.designConsistency.validateTransition(
        'operations',
        this.operationContract(request, draft),
      );
    }

    if (!report.valid) {
      throw this.transitionException('Operations', report.issues, draft);
    }

    return draft;
  }

  private async requestOperationsRepair(
    httpRequest: AuthenticatedRequest,
    request: AiWizardRequest,
    draft: Record<string, unknown>,
    issues: AiWizardIssue[],
    caller: string,
  ) {
    return this.llm.generateJson<Record<string, unknown>>({
      model: 'gpt-4o-mini',
      system: [
        'You repair a backend Operations draft after deterministic design validation failed.',
        'Return JSON only with shape {"operations": BackendOperation[]}.',
        'Preserve the confirmed Project, Planning, and ERD exactly.',
        'Resolve every reported issue without inventing entities or fields.',
        'Remove duplicates and server-managed request fields.',
        'POST create and PUT full-update operations must include every required client-owned ERD field. PATCH may be partial.',
        'Never require an <entity>Id to exist unless that entity and foreign-key relation exist in the ERD.',
      ].join('\n'),
      user: [
        'Confirmed ERD:',
        JSON.stringify(
          { entities: request.entities, relations: request.relations },
          null,
          2,
        ),
        '',
        'Rejected Operations draft:',
        JSON.stringify(draft, null, 2),
        '',
        'Deterministic validation log:',
        JSON.stringify(issues, null, 2),
      ].join('\n'),
      temperature: 0,
      context: {
        userId: httpRequest.auth?.sub,
        caller,
      },
    });
  }

  private operationContract(
    request: AiWizardRequest,
    draft: Record<string, unknown>,
  ): DesignContract {
    return {
      project: request.project,
      entities: request.entities as DesignContract['entities'],
      relations: request.relations as DesignContract['relations'],
      operations: (Array.isArray(draft.operations)
        ? draft.operations
        : []) as DesignOperation[],
    };
  }

  private transitionException(
    stage: string,
    issues: AiWizardIssue[],
    draft?: Record<string, unknown>,
  ) {
    return new UnprocessableEntityException({
      message: `${stage} 단계의 이전 단계 교차 검증을 통과하지 못했습니다. 표시된 항목을 수정하거나 AI 보조를 다시 실행해 주세요.`,
      issues,
      ...(draft ? { draft } : {}),
    });
  }
}

function buildLanguageInstruction(language: AiWizardRequest['language']) {
  if (language === 'ko') {
    return [
      'Output language: Korean.',
      'All user-facing natural-language values must be written in Korean, including project descriptions, planning purpose, constraints, operation labels, and operation descriptions.',
      'Keep code identifiers in conventional English: ids, entity ids, field names, API paths, HTTP methods, enum values, and JSON property names must remain ASCII/camelCase/kebab-case as appropriate.',
      'Entity names may remain concise English domain model names that fit the confirmed product.',
    ].join('\n');
  }

  return [
    'Output language: English.',
    'Write all user-facing natural-language values in English.',
    'Keep code identifiers in conventional English ASCII naming.',
  ].join('\n');
}

function buildCurrentState(request: AiWizardRequest) {
  if (request.step === 'planning') {
    return {
      confirmedProject: request.project,
    };
  }

  if (request.step === 'erd') {
    return {
      confirmedProject: request.project,
      confirmedPlanning: (request.project as { planning?: unknown } | undefined)
        ?.planning,
    };
  }

  if (request.step === 'operations') {
    return {
      confirmedProject: request.project,
      confirmedPlanning: (request.project as { planning?: unknown } | undefined)
        ?.planning,
      confirmedErd: {
        entities: request.entities,
        relations: request.relations,
      },
    };
  }

  return {};
}

function buildStepInstruction(step: AiWizardStep) {
  if (step === 'project') {
    return [
      'Create a project basics draft.',
      'Return JSON shape:',
      '{ "project": { "name": string, "description": string, "database": "PostgreSQL" | "MySQL" } }',
      'Generate a fresh, random backend product idea. Do not refer to or reuse any current project text.',
      'Prefer surprising but buildable product domains over common demo apps.',
      'Do not default to health trackers, commerce/order systems, task managers, booking apps, or generic member dashboards unless the idea has an unusually specific angle.',
      'Vary the domain across attempts, such as urban operations, legal workflows, climate data, warehouse robotics, creator monetization, field inspections, local government services, industrial IoT, research labs, hospitality ops, or niche B2B SaaS.',
      'The project name and description should feel like a specific startup backend, not a tutorial sample.',
      'The description must be 3-5 concrete sentences. State the primary users, the domain data they create or manage, and the outcome they receive.',
      'Include at least 3 distinct product capabilities with explicit actions and outputs, such as ingesting a named data source, validating a submission, assigning work, calculating a result, issuing an alert, or producing an audit-ready record.',
      'Avoid vague claims such as "manage efficiently", "provide insights", or "support monitoring" unless the description also explains exactly what is managed, analyzed, or monitored and what the backend returns or triggers.',
    ].join('\n');
  }

  if (step === 'planning') {
    return [
      'Create planning content from the confirmed Project step only.',
      'Return JSON shape:',
      '{ "planning": { "purpose": string, "constraints": string } }',
      'The purpose must explicitly reflect the confirmed project name, description, framework, and database.',
      'Write the purpose as a short product overview followed by 4-6 newline-separated feature bullets. Each bullet must name a concrete user or system action, the domain object/data involved, and the resulting behavior or output.',
      'Cover only the end-to-end flows explicitly stated in the confirmed Project description. Do not add common capabilities such as notifications, access control, reporting, integrations, or audit history unless the Project explicitly requires them.',
      'Do not use generic feature statements such as "user management" or "data management" by themselves. Specify what the user does, which records are affected, and what the backend must return, update, or trigger.',
      'constraints must be newline-separated bullet lines and include code convention and generation boundaries.',
      'Do not invent a different product domain than the confirmed Project step.',
    ].join('\n');
  }

  if (step === 'erd') {
    return [
      'Create an ERD draft from the confirmed Project step and confirmed Planning step.',
      'Return JSON shape:',
      '{ "entities": ErdEntity[], "relations": ErdRelation[] }',
      'ErdEntity shape: { "id": string, "name": string, "x": number, "y": number, "fields": ErdField[] }',
      'ErdField shape: { "id": string, "name": string, "type": "uuid" | "string" | "int" | "datetime" | "boolean" | "enum", "isPrimaryKey": boolean, "isNotNull": boolean, "isForeignKey"?: boolean, "referencesEntityId"?: string }',
      'ErdRelation shape: { "id": string, "sourceId": string, "targetId": string, "sourceCardinality": "1" | "N", "targetCardinality": "1" | "N", "direction": "one-way" | "two-way", "foreignKeyOwnerId"?: string, "foreignKeyFieldName"?: string }',
      'Use positions in a large canvas around x=120..1400 and y=160..760.',
      'Treat every feature bullet in the confirmed Planning purpose as an ERD coverage requirement. Before writing JSON, map each feature to the domain records, lifecycle state, and relationships it needs; then include those models in the ERD.',
      'First identify the product domain, core workflows, and persisted concepts from the confirmed state. Then create all entities required to implement that specific product, not only the primary CRUD record.',
      'Model the data needed for complete workflows: configuration or preference records, domain rules, assignments or recipients, requests or jobs, lifecycle/status fields, event or delivery attempts, and immutable history records whenever the confirmed feature requires them.',
      'For example, when the plan requires notifications or alerts, include the relevant rule or trigger, recipient preference, notification/inbox record, delivery attempt or delivery status, and relations between them when those concepts are needed by the stated workflow. Do not use this example unless notifications or alerts are in the confirmed state.',
      'Represent important workflow states with an enum status field and timestamps such as createdAt, updatedAt, scheduledAt, processedAt, readAt, or failedAt where they are meaningful. Include error or retry data when the planned behavior depends on it.',
      'Produce a complete but focused model, normally 3-8 entities for a feature-rich product. A small plan may require fewer, but never omit a persisted concept needed by a stated feature merely to keep the ERD short.',
      'Perform a final coverage check before responding: every Planning feature must be supported by at least one entity, field, or relation, and every complex workflow must have enough records to track its state and history.',
      'Treat the confirmed state as a hard domain boundary: entity names, fields, and relationships must be directly supported by or reasonably necessary for its project description and planning notes.',
      'Do not reuse a generic sample schema. In particular, never create HealthMetric, health-record fields, airQuality, noiseLevel, User -> HealthMetric, or Project -> Task unless the confirmed state explicitly describes that domain or workflow.',
      'Do not add a generic User, Account, Project, Task, Order, or Customer entity unless the confirmed state makes that concept necessary.',
      'Every entity must have an id uuid primary key field. Add useful FK fields that match relations.',
      'When an entity has a field like userId, orderId, projectId, or another <entityName>Id field, create the matching relation to that entity.',
      'For a genuine owner-style domain pair, create a 1:N relation unless the confirmed domain clearly requires 1:1.',
      'A foreign key is valid only when referencesEntityId matches an entity id in the returned entities array.',
      'Every relation sourceId, targetId, and foreignKeyOwnerId must match returned entity ids exactly.',
      'foreignKeyFieldName must exist as a uuid FK field on foreignKeyOwnerId and reference the opposite entity.',
      'If a relationship cannot be represented with valid existing entities, omit that relationship and its FK field.',
      'Every entity and relation must be justified by the confirmed project purpose, description, and planning constraints.',
      'Do not create APIs here. Only return entities and relations.',
    ].join('\n');
  }

  return [
    'Create recommended API operation specifications from all confirmed upstream steps: Project, Planning, and ERD.',
    'Return JSON shape:',
    '{ "operations": BackendOperation[] }',
    'BackendOperation shape: { "id": string, "entityId": string, "kind": "crud" | "custom", "label": string, "method": "GET" | "POST" | "PUT" | "PATCH" | "DELETE", "path": string, "enabled": boolean, "payloadFieldIds": string[], "requestFieldIds": string[], "responseFieldIds": string[], "requestCustomFields": CustomField[], "responseCustomFields": CustomField[], "description": string, "requirements": string }',
    'CustomField shape: { "id": string, "name": string, "type": string }',
    'Include normal CRUD-style APIs and fully specify every complex capability called for by the confirmed planning. Do not reduce a complex feature to one generic endpoint.',
    'For each complex feature, create all necessary custom endpoints for its workflow. For example, a notification capability may need preference management, eligible-recipient lookup, dispatch or queue submission, delivery-status or retry handling, inbox listing, and read or dismiss actions when each is relevant to the confirmed product.',
    'For every custom endpoint, write requirements only for validation, state transitions, duplicate handling, failure behavior, asynchronous processing, integrations, or access rules when those concerns are explicitly required by the confirmed Planning and represented by the ERD.',
    'Treat primary keys, createdAt, and updatedAt as server-managed fields: exclude them from create/update requestFieldIds and payloadFieldIds unless the confirmed product explicitly requires clients to provide them; include them in responses when useful.',
    'For relation foreign keys in create/update requests, require the referenced record to exist and specify a 404 failure instead of allowing a raw database foreign-key error.',
    'When the confirmed ERD or Planning implies uniqueness, enum membership, non-negative quantities, non-empty text, or state-transition rules, state those constraints explicitly in requirements so DTO, service, and database validation can enforce them consistently.',
    'Use a shared, specific feature label in each related endpoint description so the workflow can be recognized as one capability.',
    'Use only entityId and field ids that exist in the provided ERD.',
    'The confirmed Project, Planning, and ERD together are the implementation boundary. Every endpoint description and requirement must trace to a named Planning capability and use only the ERD entities, fields, and relations needed for it.',
    'Do not introduce a new requirement merely because it is common in backend products. If a capability cannot be represented by the confirmed contract, omit the endpoint or requirement instead of inventing supporting concepts.',
    'API descriptions must reflect the confirmed project purpose and planning constraints.',
    'Do not introduce new entities or fields. Use the confirmed ERD exactly.',
    'Before responding, self-check every operation: field ids are unique, id/createdAt/updatedAt are absent from requests, POST create and PUT full-update requests contain every required client-owned ERD field, PATCH requests may be partial, every FK request states 404 behavior, and no existence rule refers to an entity absent from the ERD.',
  ].join('\n');
}

type ErdDraftRecord = Record<string, unknown>;

function sanitizeErdDraft(draft: ErdDraftRecord) {
  const rawEntities = Array.isArray(draft.entities)
    ? (draft.entities.filter(isRecord) as ErdDraftRecord[])
    : [];
  const rawRelations = Array.isArray(draft.relations)
    ? (draft.relations.filter(isRecord) as ErdDraftRecord[])
    : [];
  const entities = rawEntities.map((entity, entityIndex) => {
    const entityId = normalizeId(
      stringValue(entity.id) ||
        stringValue(entity.name) ||
        `entity_${entityIndex + 1}`,
    );
    const rawFields = Array.isArray(entity.fields)
      ? (entity.fields.filter(isRecord) as ErdDraftRecord[])
      : [];
    const fields = rawFields.map((field, fieldIndex) => {
      const fieldName =
        sanitizeFieldName(stringValue(field.name)) ||
        (fieldIndex === 0 ? 'id' : `field${fieldIndex + 1}`);

      return {
        id: normalizeId(`${entityId}_${fieldName}`),
        name: fieldName,
        type: normalizeFieldType(stringValue(field.type)),
        isPrimaryKey: Boolean(field.isPrimaryKey) || fieldName === 'id',
        isNotNull:
          Boolean(field.isNotNull) ||
          Boolean(field.isPrimaryKey) ||
          fieldName === 'id',
        ...(Boolean(field.isForeignKey) ? { isForeignKey: true } : {}),
        ...(stringValue(field.referencesEntityId)
          ? { referencesEntityId: stringValue(field.referencesEntityId) }
          : {}),
      };
    });

    if (!fields.some((field) => field.isPrimaryKey)) {
      fields.unshift({
        id: `${entityId}_id`,
        name: 'id',
        type: 'uuid',
        isPrimaryKey: true,
        isNotNull: true,
      });
    }

    return {
      id: entityId,
      name: stringValue(entity.name) || toPascalLabel(entityId),
      x: numberValue(entity.x, 160 + (entityIndex % 3) * 420),
      y: numberValue(entity.y, 180 + Math.floor(entityIndex / 3) * 320),
      fields,
    };
  });

  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const lookup = new Map<string, string>();

  entities.forEach((entity) => {
    lookup.set(entity.id.toLowerCase(), entity.id);
    lookup.set(normalizeId(entity.name).toLowerCase(), entity.id);
    lookup.set(entity.name.toLowerCase(), entity.id);
  });

  const resolveEntityId = (value: unknown) =>
    lookup.get(stringValue(value).toLowerCase()) ?? '';

  entities.forEach((entity) => {
    entity.fields = entity.fields.map((field) => {
      const referencesEntityId = resolveEntityId(field.referencesEntityId);

      if (
        !field.isForeignKey ||
        !referencesEntityId ||
        referencesEntityId === entity.id
      ) {
        const {
          isForeignKey,
          referencesEntityId: _referencesEntityId,
          ...plainField
        } = field;
        return plainField;
      }

      return {
        ...field,
        isForeignKey: true,
        referencesEntityId,
      };
    });
  });

  const relationKeys = new Set<string>();
  const addRelation = (
    validRelations: Array<Record<string, unknown>>,
    relation: Record<string, unknown>,
    index: number,
  ) => {
    const sourceId = resolveEntityId(relation.sourceId);
    const targetId = resolveEntityId(relation.targetId);

    if (!sourceId || !targetId || sourceId === targetId) {
      return validRelations;
    }

    const sourceCardinality = relation.sourceCardinality === 'N' ? 'N' : '1';
    const targetCardinality = relation.targetCardinality === '1' ? '1' : 'N';
    // The design contract permits one relation per unordered entity pair.
    // A -> B (1:N) and B -> A (N:1) describe the same relationship and must
    // not survive as separate entries or be re-inferred from the FK below.
    const relationKey = [sourceId, targetId].sort().join(':');

    if (relationKeys.has(relationKey)) {
      return validRelations;
    }

    relationKeys.add(relationKey);

    const requestedOwnerId = resolveEntityId(relation.foreignKeyOwnerId);
    const inferredOwnerId =
      sourceCardinality === 'N' && targetCardinality === '1'
        ? sourceId
        : sourceCardinality === '1' && targetCardinality === 'N'
          ? targetId
          : targetId;
    const foreignKeyOwnerId =
      requestedOwnerId === sourceId || requestedOwnerId === targetId
        ? requestedOwnerId
        : inferredOwnerId;
    const referencedEntityId =
      foreignKeyOwnerId === sourceId ? targetId : sourceId;
    const ownerEntity = entityById.get(foreignKeyOwnerId);
    const referencedEntity = entityById.get(referencedEntityId);

    if (!ownerEntity || !referencedEntity) {
      return validRelations;
    }

    const foreignKeyFieldName =
      sanitizeFieldName(stringValue(relation.foreignKeyFieldName)) ||
      toForeignKeyName(referencedEntity.name);
    const existingField = ownerEntity.fields.find(
      (field) => field.name === foreignKeyFieldName,
    );

    if (existingField) {
      existingField.type = 'uuid';
      existingField.isPrimaryKey = false;
      existingField.isNotNull = true;
      existingField.isForeignKey = true;
      existingField.referencesEntityId = referencedEntityId;
    } else {
      ownerEntity.fields.push({
        id: normalizeId(`${foreignKeyOwnerId}_${foreignKeyFieldName}`),
        name: foreignKeyFieldName,
        type: 'uuid',
        isPrimaryKey: false,
        isNotNull: true,
        isForeignKey: true,
        referencesEntityId: referencedEntityId,
      });
    }

    validRelations.push({
      id: stringValue(relation.id) || `rel_${sourceId}_${targetId}_${index}`,
      sourceId,
      targetId,
      sourceCardinality,
      targetCardinality,
      direction: relation.direction === 'one-way' ? 'one-way' : 'two-way',
      foreignKeyOwnerId,
      foreignKeyFieldName,
    });

    return validRelations;
  };

  const relations = rawRelations.reduce<Array<Record<string, unknown>>>(
    addRelation,
    [],
  );

  entities.forEach((entity) => {
    entity.fields.forEach((field, fieldIndex) => {
      const referencedEntityId =
        resolveEntityId(field.referencesEntityId) ||
        inferReferencedEntityIdFromField(field.name, entity.id, lookup);

      if (!referencedEntityId || referencedEntityId === entity.id) {
        return;
      }

      addRelation(
        relations,
        {
          id: `rel_${referencedEntityId}_${entity.id}_inferred_${fieldIndex}`,
          sourceId: referencedEntityId,
          targetId: entity.id,
          sourceCardinality: '1',
          targetCardinality: 'N',
          direction: 'two-way',
          foreignKeyOwnerId: entity.id,
          foreignKeyFieldName: field.name,
        },
        rawRelations.length + fieldIndex,
      );
    });
  });

  const relationForeignKeys = new Set(
    relations.map(
      (relation) =>
        `${relation.foreignKeyOwnerId}:${relation.foreignKeyFieldName}`,
    ),
  );

  return {
    entities: entities.map((entity) => ({
      ...entity,
      fields: entity.fields.map((field) => {
        if (
          !field.isForeignKey ||
          relationForeignKeys.has(`${entity.id}:${field.name}`)
        ) {
          return field;
        }

        const {
          isForeignKey,
          referencesEntityId: _referencesEntityId,
          ...plainField
        } = field;
        return plainField;
      }),
    })),
    relations,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeFieldType(value: string) {
  return ['uuid', 'string', 'int', 'datetime', 'boolean', 'enum'].includes(
    value,
  )
    ? value
    : 'string';
}

function sanitizeFieldName(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9_]/g, '');

  if (!sanitized || /^\d/.test(sanitized)) {
    return '';
  }

  return sanitized;
}

function normalizeId(value: string) {
  return value
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function inferReferencedEntityIdFromField(
  fieldName: string,
  ownerEntityId: string,
  lookup: Map<string, string>,
) {
  const normalizedField = normalizeId(fieldName);

  if (!normalizedField.endsWith('_id') && !normalizedField.endsWith('id')) {
    return '';
  }

  const baseName = normalizedField.replace(/_?id$/, '');

  if (!baseName || baseName === ownerEntityId) {
    return '';
  }

  return lookup.get(baseName) ?? '';
}

function toPascalLabel(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function toForeignKeyName(entityName: string) {
  const base = entityName
    .trim()
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+(\w)/g, (_, letter: string) => letter.toUpperCase())
    .replace(/^\w/, (letter) => letter.toLowerCase());

  return `${base || 'entity'}Id`;
}
