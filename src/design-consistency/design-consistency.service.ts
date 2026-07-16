import { Injectable } from '@nestjs/common';

export type DesignField = {
  id: string;
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isNotNull?: boolean;
  isForeignKey?: boolean;
  referencesEntityId?: string;
};

export type DesignEntity = {
  id: string;
  name: string;
  fields?: DesignField[];
};

export type DesignRelation = {
  sourceId: string;
  targetId: string;
  sourceCardinality: string;
  targetCardinality: string;
  direction: string;
  foreignKeyOwnerId?: string;
  foreignKeyFieldName?: string;
};

export type DesignCustomField = {
  id?: string;
  name: string;
  type: string;
};

export type DesignOperation = {
  id?: string;
  entityId: string;
  kind: string;
  label: string;
  method: string;
  path: string;
  enabled: boolean;
  payloadFieldIds?: string[];
  requestFieldIds?: string[];
  responseFieldIds?: string[];
  requestCustomFields?: DesignCustomField[];
  responseCustomFields?: DesignCustomField[];
  description?: string;
  requirements?: string;
};

export type DesignContract = {
  project?: Record<string, unknown>;
  entities?: DesignEntity[];
  relations?: DesignRelation[];
  operations?: DesignOperation[];
};

export type DesignConsistencyIssue = {
  code: string;
  severity: 'error' | 'warning';
  location: string;
  message: string;
  suggestion: string;
};

export type DesignConsistencyReport = {
  valid: boolean;
  issues: DesignConsistencyIssue[];
  checked: {
    entities: number;
    relations: number;
    operations: number;
  };
};

export type NormalizedDesignEntity = {
  name?: unknown;
  fields?: Array<Record<string, unknown>>;
  relations?: Array<Record<string, unknown>>;
  endpoints?: Array<Record<string, unknown>>;
};

export type NormalizedDesignSpec = {
  entities?: NormalizedDesignEntity[];
  endpoints?: Array<Record<string, unknown>>;
};

export type WizardDesignStage = 'project' | 'planning' | 'erd' | 'operations';

type CapabilityCoverageRule = {
  code: string;
  label: string;
  source: RegExp;
  erd: RegExp;
  operations: RegExp;
  suggestion: string;
};

const SERVER_MANAGED_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);
const CREATE_WORDS = /(?:create|register|add|생성|등록|추가)/i;
const NOT_FOUND_REQUIREMENT = /(?:404|not\s+found|존재하지|존재해야|없으면)/i;
const CAPABILITY_COVERAGE_RULES: CapabilityCoverageRule[] = [
  {
    code: 'NOTIFICATION',
    label: '알림·상태 업데이트 발송',
    source:
      /(?:알림|경고|통지|발송|메시지|notification|notify|alert|delivery|inbox)/i,
    erd: /(?:notification|notice|alert|message|recipient|delivery|inbox|subscription)/i,
    operations:
      /(?:알림|경고|통지|발송|메시지|notification|notify|alert|delivery|inbox)/i,
    suggestion:
      '수신자와 발송 상태를 저장할 엔티티 및 발송/조회 API를 추가하거나, 상위 요구사항에서 해당 기능을 제거하세요.',
  },
  {
    code: 'INSPECTION',
    label: '현장 검사·점검',
    source: /(?:검사|점검|inspection|inspect|checklist|site\s*visit)/i,
    erd: /(?:inspection|inspect|checklist|sitevisit|fieldcheck)/i,
    operations: /(?:검사|점검|inspection|inspect|checklist|site.?visit)/i,
    suggestion:
      '검사 일정, 결과, 상태를 표현하는 엔티티와 API를 추가하거나, 상위 요구사항에서 검사 기능을 제거하세요.',
  },
  {
    code: 'HISTORY_AUDIT',
    label: '이력·감사 기록',
    source: /(?:이력|감사|history|audit|추적 기록)/i,
    erd: /(?:history|audit|event|log)/i,
    operations: /(?:이력|감사|history|audit|event|log)/i,
    suggestion:
      '상태 변경 이력을 저장하는 엔티티와 조회 또는 기록 API를 추가하세요.',
  },
  {
    code: 'RESOURCE_ALLOCATION',
    label: '자원 배분·할당',
    source:
      /(?:자원.{0,8}(?:배분|할당|배정)|resource.{0,12}allocat|assignment)/i,
    erd: /(?:resource|allocation|assignment|assignee)/i,
    operations: /(?:자원|배분|할당|배정|resource|allocat|assign)/i,
    suggestion: '자원과 할당 상태를 표현하는 엔티티 및 할당 API를 추가하세요.',
  },
  {
    code: 'SCHEDULING',
    label: '일정·예약',
    source: /(?:일정|예약|스케줄|schedule|booking)/i,
    erd: /(?:schedule|scheduled|appointment|booking|startat|endat)/i,
    operations: /(?:일정|예약|스케줄|schedule|booking)/i,
    suggestion:
      '일정 시각과 상태를 저장할 필드/엔티티 및 일정 관리 API를 추가하세요.',
  },
  {
    code: 'APPROVAL_REVIEW',
    label: '검토·승인',
    source: /(?:검토|승인|review|approval|approve)/i,
    erd: /(?:status|review|approval|approved|reviewed)/i,
    operations: /(?:상태|status|검토|승인|review|approval|approve)/i,
    suggestion:
      '승인 상태와 검토 결과를 표현하는 필드 및 상태 변경 API를 추가하세요.',
  },
];

@Injectable()
export class DesignConsistencyService {
  validateTransition(
    stage: WizardDesignStage,
    contract: DesignContract,
  ): DesignConsistencyReport {
    const issues: DesignConsistencyIssue[] = [];
    const project = this.asRecord(contract.project);
    const planning = this.asRecord(project.planning);
    const projectName = this.recordString(project, 'name');
    const description = this.recordString(project, 'description');
    const purpose = this.recordString(planning, 'purpose');
    const constraints = this.recordString(planning, 'constraints');
    const framework = this.recordString(project, 'framework');
    const database = this.recordString(project, 'database');
    const add = (
      code: string,
      location: string,
      message: string,
      suggestion: string,
    ) =>
      issues.push({
        code,
        severity: 'error',
        location,
        message,
        suggestion,
      });

    if (!projectName || !description) {
      add(
        'PROJECT_BRIEF_INCOMPLETE',
        'project',
        '프로젝트 이름과 설명이 모두 필요합니다.',
        'Project 단계에서 구체적인 사용자, 데이터, 결과를 포함해 이름과 설명을 작성하세요.',
      );
    }

    if (stage !== 'project') {
      const featureBullets = purpose
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^[-*]\s+/.test(line));
      if (!purpose || featureBullets.length < 3) {
        add(
          'PLANNING_FEATURES_INCOMPLETE',
          'project.planning.purpose',
          'Planning 목적에는 구현 가능한 기능 항목이 최소 3개 필요합니다.',
          '각 항목에 사용자 행동, 대상 데이터, 결과를 명시하세요.',
        );
      }
      if (!constraints) {
        add(
          'PLANNING_CONSTRAINTS_MISSING',
          'project.planning.constraints',
          'Planning 제약 조건이 비어 있습니다.',
          '프레임워크, 데이터베이스, 생성 경계를 명시하세요.',
        );
      }
      if (
        framework &&
        !this.normalizeName(`${purpose} ${constraints}`).includes(
          this.normalizeName(framework),
        )
      ) {
        add(
          'PLANNING_FRAMEWORK_MISMATCH',
          'project.planning.constraints',
          `Planning에 선택한 프레임워크 ${framework}가 반영되지 않았습니다.`,
          `${framework} 사용 조건을 Planning에 명시하세요.`,
        );
      }
      if (
        database &&
        !this.normalizeName(`${purpose} ${constraints}`).includes(
          this.normalizeName(database),
        )
      ) {
        add(
          'PLANNING_DATABASE_MISMATCH',
          'project.planning.constraints',
          `Planning에 선택한 데이터베이스 ${database}가 반영되지 않았습니다.`,
          `${database} 사용 조건을 Planning에 명시하세요.`,
        );
      }
    }

    if (stage === 'erd' || stage === 'operations') {
      const structural = this.validate({
        entities: contract.entities,
        relations: contract.relations,
        operations: stage === 'operations' ? contract.operations : [],
      });
      issues.push(
        ...structural.issues.filter((issue) => issue.severity === 'error'),
      );
      const source = `${description}\n${purpose}`;
      const erdTarget = JSON.stringify(
        (contract.entities ?? []).map((entity) => ({
          name: entity.name,
          fields: (entity.fields ?? []).map((field) => field.name),
        })),
      );
      const operationTarget = JSON.stringify(
        (contract.operations ?? [])
          .filter((operation) => operation.enabled !== false)
          .map((operation) => ({
            label: operation.label,
            path: operation.path,
            description: operation.description,
            requirements: operation.requirements,
          })),
      );

      for (const rule of CAPABILITY_COVERAGE_RULES) {
        if (!rule.source.test(source)) continue;
        if (!rule.erd.test(erdTarget)) {
          add(
            `ERD_CAPABILITY_${rule.code}_MISSING`,
            'entities',
            `Project/Planning의 '${rule.label}' 기능을 ERD가 표현하지 못합니다.`,
            rule.suggestion,
          );
        } else if (
          stage === 'operations' &&
          !rule.operations.test(operationTarget)
        ) {
          add(
            `OPERATION_CAPABILITY_${rule.code}_MISSING`,
            'operations',
            `Project/Planning의 '${rule.label}' 기능을 구현할 API가 없습니다.`,
            rule.suggestion,
          );
        }
      }
    }

    const uniqueIssues = Array.from(
      new Map(
        issues.map((issue) => [
          `${issue.code}:${issue.location}:${issue.message}`,
          issue,
        ]),
      ).values(),
    );
    return {
      valid: uniqueIssues.length === 0,
      issues: uniqueIssues,
      checked: {
        entities: contract.entities?.length ?? 0,
        relations: contract.relations?.length ?? 0,
        operations:
          contract.operations?.filter(
            (operation) => operation.enabled !== false,
          ).length ?? 0,
      },
    };
  }

  repairOperations(contract: DesignContract): DesignOperation[] {
    const entities = contract.entities ?? [];
    const entityById = new Map(entities.map((entity) => [entity.id, entity]));
    const entityByName = new Map(
      entities.map((entity) => [this.normalizeName(entity.name), entity]),
    );

    return (contract.operations ?? []).map((operation) => {
      const entity = entityById.get(operation.entityId);
      if (!entity) return operation;

      const entityFields = entity.fields ?? [];
      const fieldById = new Map(entityFields.map((field) => [field.id, field]));
      const requestSource =
        operation.requestFieldIds && operation.requestFieldIds.length > 0
          ? operation.requestFieldIds
          : (operation.payloadFieldIds ?? []);
      const requestFieldIds = this.uniqueStrings(requestSource).filter(
        (fieldId) => {
          const field = fieldById.get(fieldId);
          return field && !SERVER_MANAGED_FIELDS.has(field.name);
        },
      );
      const responseFieldIds = this.uniqueStrings(
        operation.responseFieldIds ?? [],
      ).filter((fieldId) => fieldById.has(fieldId));
      const isCreate =
        operation.method.toUpperCase() === 'POST' &&
        (operation.kind.toLowerCase() === 'crud' ||
          CREATE_WORDS.test(
            `${operation.label} ${operation.description ?? ''}`,
          ));

      const requiresCompleteRequest =
        isCreate || operation.method.toUpperCase() === 'PUT';
      if (requiresCompleteRequest) {
        for (const field of entityFields) {
          if (
            field.isNotNull &&
            !field.isPrimaryKey &&
            !SERVER_MANAGED_FIELDS.has(field.name) &&
            !requestFieldIds.includes(field.id)
          ) {
            requestFieldIds.push(field.id);
          }
        }
        if (isCreate) {
          const id = entityFields.find(
            (field) => field.isPrimaryKey && field.name === 'id',
          );
          if (id && !responseFieldIds.includes(id.id)) {
            responseFieldIds.push(id.id);
          }
        }
      }

      const requestCustomFields = this.uniqueCustomFields(
        operation.requestCustomFields ?? [],
        new Set(
          requestFieldIds
            .map((fieldId) => fieldById.get(fieldId)?.name)
            .filter((name): name is string => Boolean(name)),
        ),
      ).filter((field) => !SERVER_MANAGED_FIELDS.has(field.name));
      const responseCustomFields = this.uniqueCustomFields(
        operation.responseCustomFields ?? [],
        new Set(
          responseFieldIds
            .map((fieldId) => fieldById.get(fieldId)?.name)
            .filter((name): name is string => Boolean(name)),
        ),
      );
      let requirements = operation.requirements ?? '';

      for (const fieldId of requestFieldIds) {
        const field = fieldById.get(fieldId);
        if (!field?.name.endsWith('Id')) continue;
        const target = field.referencesEntityId
          ? entityById.get(field.referencesEntityId)
          : entityByName.get(this.normalizeName(field.name.slice(0, -2)));
        const mentionsField = new RegExp(
          `\\b${this.escapeRegExp(field.name)}\\b`,
          'i',
        ).test(requirements);
        if (
          !target &&
          mentionsField &&
          NOT_FOUND_REQUIREMENT.test(requirements)
        ) {
          requirements = this.removeExistenceRequirement(
            requirements,
            field.name,
          );
        } else if (
          field.isForeignKey &&
          !NOT_FOUND_REQUIREMENT.test(requirements)
        ) {
          const rule = `${field.name} must reference an existing ${target?.name ?? field.name.slice(0, -2)} record; return 404 when it does not exist.`;
          requirements = [requirements.trim(), rule].filter(Boolean).join('\n');
        }
      }

      return {
        ...operation,
        enabled: operation.enabled !== false,
        payloadFieldIds: requestFieldIds,
        requestFieldIds,
        responseFieldIds,
        requestCustomFields,
        responseCustomFields,
        requirements: requirements.trim(),
      };
    });
  }

  validate(contract: DesignContract): DesignConsistencyReport {
    const entities = contract.entities ?? [];
    const relations = contract.relations ?? [];
    const operations = (contract.operations ?? []).filter(
      (operation) => operation.enabled !== false,
    );
    const issues: DesignConsistencyIssue[] = [];
    const entityById = new Map<string, DesignEntity>();
    const entityByName = new Map<string, DesignEntity>();
    const fieldOwnerById = new Map<
      string,
      { entity: DesignEntity; field: DesignField }
    >();

    const add = (
      code: string,
      location: string,
      message: string,
      suggestion: string,
      severity: DesignConsistencyIssue['severity'] = 'error',
    ) => issues.push({ code, severity, location, message, suggestion });

    for (const [entityIndex, entity] of entities.entries()) {
      const location = `entities[${entityIndex}]`;
      const normalizedName = this.normalizeName(entity.name);
      if (!entity.id?.trim() || !entity.name?.trim()) {
        add(
          'ENTITY_IDENTITY_REQUIRED',
          location,
          'Entity id and name are required.',
          'Assign a stable entity id and an ASCII PascalCase entity name.',
        );
        continue;
      }
      if (entityById.has(entity.id)) {
        add(
          'DUPLICATE_ENTITY_ID',
          location,
          `Entity id ${entity.id} is duplicated.`,
          'Give every entity a unique id.',
        );
      }
      if (entityByName.has(normalizedName)) {
        add(
          'DUPLICATE_ENTITY_NAME',
          location,
          `Entity name ${entity.name} collides with another entity.`,
          'Use a unique entity name.',
        );
      }
      entityById.set(entity.id, entity);
      entityByName.set(normalizedName, entity);

      const fields = entity.fields ?? [];
      const fieldNames = new Set<string>();
      const primaryKeys = fields.filter((field) => field.isPrimaryKey);
      if (primaryKeys.length !== 1) {
        add(
          'INVALID_PRIMARY_KEY_COUNT',
          `${location}.fields`,
          `${entity.name} must have exactly one primary key; found ${primaryKeys.length}.`,
          'Define one uuid id primary key.',
        );
      } else if (
        primaryKeys[0].name !== 'id' ||
        primaryKeys[0].type.toLowerCase() !== 'uuid'
      ) {
        add(
          'INVALID_PRIMARY_KEY_SHAPE',
          `${location}.fields`,
          `${entity.name} primary key must be id: uuid.`,
          'Rename the primary key to id and set its type to uuid.',
        );
      }

      for (const [fieldIndex, field] of fields.entries()) {
        const fieldLocation = `${location}.fields[${fieldIndex}]`;
        const normalizedFieldName = field.name.trim().toLowerCase();
        if (!field.id?.trim() || !field.name?.trim()) {
          add(
            'FIELD_IDENTITY_REQUIRED',
            fieldLocation,
            'Field id and name are required.',
            'Assign a stable field id and camelCase field name.',
          );
          continue;
        }
        if (fieldNames.has(normalizedFieldName)) {
          add(
            'DUPLICATE_ENTITY_FIELD',
            fieldLocation,
            `${entity.name}.${field.name} is duplicated.`,
            'Keep one field definition per field name.',
          );
        }
        fieldNames.add(normalizedFieldName);
        if (fieldOwnerById.has(field.id)) {
          add(
            'DUPLICATE_FIELD_ID',
            fieldLocation,
            `Field id ${field.id} is reused.`,
            'Give every ERD field a globally unique id.',
          );
        }
        fieldOwnerById.set(field.id, { entity, field });
      }
    }

    const relationKeys = new Set<string>();
    for (const [relationIndex, relation] of relations.entries()) {
      const location = `relations[${relationIndex}]`;
      const source = entityById.get(relation.sourceId);
      const target = entityById.get(relation.targetId);
      if (!source || !target || source === target) {
        add(
          'INVALID_RELATION_ENDPOINT',
          location,
          'Relation source and target must reference two existing entities.',
          'Select existing, distinct source and target entities.',
        );
        continue;
      }
      const key = [relation.sourceId, relation.targetId].sort().join(':');
      if (relationKeys.has(key)) {
        add(
          'DUPLICATE_RELATION',
          location,
          `A relation between ${source.name} and ${target.name} is duplicated.`,
          'Keep a single relation and one owning foreign key.',
        );
      }
      relationKeys.add(key);

      const owner = relation.foreignKeyOwnerId
        ? entityById.get(relation.foreignKeyOwnerId)
        : undefined;
      const opposite =
        owner === source ? target : owner === target ? source : undefined;
      const foreignKey = owner?.fields?.find(
        (field) => field.name === relation.foreignKeyFieldName,
      );
      if (!owner || !opposite || !foreignKey) {
        add(
          'RELATION_FOREIGN_KEY_MISSING',
          location,
          `Relation ${source.name}-${target.name} has no valid owning foreign-key field.`,
          'Set foreignKeyOwnerId and foreignKeyFieldName to an existing uuid field on the owning entity.',
        );
      } else if (
        foreignKey.type.toLowerCase() !== 'uuid' ||
        !foreignKey.isForeignKey ||
        foreignKey.referencesEntityId !== opposite.id
      ) {
        add(
          'RELATION_FOREIGN_KEY_MISMATCH',
          location,
          `${owner.name}.${foreignKey.name} does not reference ${opposite.name} consistently.`,
          `Mark ${foreignKey.name} as a uuid foreign key referencing ${opposite.id}.`,
        );
      } else if (this.normalizeName(foreignKey.name) === 'entityid') {
        add(
          'AMBIGUOUS_FOREIGN_KEY_NAME',
          `${location}.foreignKeyFieldName`,
          `${owner.name}.${foreignKey.name} is ambiguous but the relation specifically references ${opposite.name}.`,
          `Rename the foreign key to ${opposite.name.charAt(0).toLowerCase()}${opposite.name.slice(1)}Id and update related API fields.`,
        );
      }
    }

    for (const [entityIndex, entity] of entities.entries()) {
      for (const [fieldIndex, field] of (entity.fields ?? []).entries()) {
        if (!field.isForeignKey) continue;
        const target = field.referencesEntityId
          ? entityById.get(field.referencesEntityId)
          : undefined;
        const relation = relations.find(
          (candidate) =>
            candidate.foreignKeyOwnerId === entity.id &&
            candidate.foreignKeyFieldName === field.name,
        );
        if (!target || !relation) {
          add(
            'ORPHAN_FOREIGN_KEY',
            `entities[${entityIndex}].fields[${fieldIndex}]`,
            `${entity.name}.${field.name} is marked as a foreign key without a matching entity and relation.`,
            'Create the referenced entity and relation, or remove the foreign-key requirement.',
          );
        }
      }
    }

    const routes = new Set<string>();
    for (const [operationIndex, operation] of operations.entries()) {
      const location = `operations[${operationIndex}]`;
      const entity = entityById.get(operation.entityId);
      if (!entity) {
        add(
          'OPERATION_ENTITY_NOT_FOUND',
          location,
          `Operation ${operation.label || operation.path} references an unknown entity.`,
          'Bind the operation to an existing ERD entity.',
        );
        continue;
      }
      const route = `${operation.method.toUpperCase()} ${this.normalizePath(operation.path)}`;
      if (routes.has(route)) {
        add(
          'DUPLICATE_OPERATION_ROUTE',
          location,
          `Route ${route} is defined more than once.`,
          'Merge or remove the duplicate operation.',
        );
      }
      routes.add(route);

      const requestFieldIds =
        operation.requestFieldIds && operation.requestFieldIds.length > 0
          ? operation.requestFieldIds
          : (operation.payloadFieldIds ?? []);
      const responseFieldIds = operation.responseFieldIds ?? [];
      const requestFields = this.resolveOperationFields(
        entity,
        requestFieldIds,
        operation.requestCustomFields ?? [],
        `${location}.requestFields`,
        add,
      );
      const responseFields = this.resolveOperationFields(
        entity,
        responseFieldIds,
        operation.responseCustomFields ?? [],
        `${location}.responseFields`,
        add,
      );

      for (const field of requestFields) {
        if (SERVER_MANAGED_FIELDS.has(field.name)) {
          add(
            'SERVER_MANAGED_REQUEST_FIELD',
            `${location}.requestFields`,
            `${operation.label} accepts server-managed field ${field.name}.`,
            `Remove ${field.name} from the request; include it only in responses.`,
          );
        }
      }

      const isCreate =
        operation.method.toUpperCase() === 'POST' &&
        (operation.kind.toLowerCase() === 'crud' ||
          CREATE_WORDS.test(
            `${operation.label} ${operation.description ?? ''}`,
          ));
      const requiresCompleteRequest =
        isCreate || operation.method.toUpperCase() === 'PUT';
      if (requiresCompleteRequest) {
        const requestNames = new Set(requestFields.map((field) => field.name));
        const requiredClientFields = (entity.fields ?? []).filter(
          (field) =>
            field.isNotNull &&
            !field.isPrimaryKey &&
            !SERVER_MANAGED_FIELDS.has(field.name),
        );
        for (const field of requiredClientFields) {
          if (!requestNames.has(field.name)) {
            add(
              isCreate
                ? 'CREATE_REQUIRED_FIELD_MISSING'
                : 'FULL_UPDATE_REQUIRED_FIELD_MISSING',
              `${location}.requestFields`,
              isCreate
                ? `${operation.label} cannot create ${entity.name} because required field ${field.name} is missing.`
                : `${operation.label}는 PUT 전체 수정이지만 필수 필드 ${entity.name}.${field.name}가 누락되었습니다.`,
              isCreate
                ? `Add ${field.name} to requestFieldIds, or make/justify it as a server-derived field in the design.`
                : `${field.name}를 PUT 요청에 추가하거나 부분 수정 의도라면 PATCH를 사용하세요.`,
            );
          }
        }
        if (isCreate && !responseFields.some((field) => field.name === 'id')) {
          add(
            'CREATE_ID_RESPONSE_MISSING',
            `${location}.responseFields`,
            `${operation.label} does not return the created id.`,
            'Include the entity id in responseFieldIds.',
            'warning',
          );
        }
      }

      const requirement = operation.requirements ?? '';
      for (const field of requestFields.filter((candidate) =>
        candidate.name.endsWith('Id'),
      )) {
        const fieldDefinition = (entity.fields ?? []).find(
          (candidate) => candidate.name === field.name,
        );
        const target = fieldDefinition?.referencesEntityId
          ? entityById.get(fieldDefinition.referencesEntityId)
          : undefined;
        const namedTarget = entityByName.get(
          this.normalizeName(field.name.slice(0, -2)),
        );
        const demandsExistence =
          NOT_FOUND_REQUIREMENT.test(requirement) &&
          new RegExp(`\\b${this.escapeRegExp(field.name)}\\b`, 'i').test(
            requirement,
          );
        if (demandsExistence && !target && !namedTarget) {
          add(
            'UNRESOLVABLE_EXISTENCE_REQUIREMENT',
            `${location}.requirements`,
            `${field.name} existence is required, but no matching ERD entity/relation exists.`,
            `Add the referenced entity and a relation for ${field.name}, or remove the existence requirement.`,
          );
        }
        if (
          fieldDefinition?.isForeignKey &&
          !NOT_FOUND_REQUIREMENT.test(requirement)
        ) {
          add(
            'FOREIGN_KEY_404_REQUIREMENT_MISSING',
            `${location}.requirements`,
            `${field.name} is a foreign key but its missing-record behavior is unspecified.`,
            `Require the referenced record to exist and return 404 when ${field.name} is missing.`,
          );
        }
      }
    }

    return {
      valid: issues.every((issue) => issue.severity !== 'error'),
      issues,
      checked: {
        entities: entities.length,
        relations: relations.length,
        operations: operations.length,
      },
    };
  }

  /**
   * Re-checks the lossy AppSpec produced from Markdown. This deliberately does
   * not depend on build-layer types so the same semantic gate can be used by
   * the wizard, workspace writer, and build graph.
   */
  validateNormalizedSpec(spec: NormalizedDesignSpec): DesignConsistencyReport {
    const entities = Array.isArray(spec.entities) ? spec.entities : [];
    const endpoints =
      Array.isArray(spec.endpoints) && spec.endpoints.length > 0
        ? spec.endpoints
        : entities.flatMap((entity) =>
            Array.isArray(entity.endpoints) ? entity.endpoints : [],
          );
    const issues: DesignConsistencyIssue[] = [];
    const entityNames = new Set(
      entities
        .map((entity) =>
          typeof entity.name === 'string'
            ? this.normalizeName(entity.name)
            : '',
        )
        .filter(Boolean),
    );
    const routes = new Set<string>();
    const relationIds = new Set<string>();
    const add = (
      code: string,
      location: string,
      message: string,
      suggestion: string,
      severity: DesignConsistencyIssue['severity'] = 'error',
    ) => issues.push({ code, severity, location, message, suggestion });

    for (const [entityIndex, entity] of entities.entries()) {
      const entityName =
        typeof entity.name === 'string' ? entity.name.trim() : '';
      const fields = Array.isArray(entity.fields) ? entity.fields : [];
      const fieldNames = new Set<string>();
      for (const relation of Array.isArray(entity.relations)
        ? entity.relations
        : []) {
        const relationId = this.recordString(relation, 'relationId');
        const source = this.recordString(relation, 'source');
        const target = this.recordString(relation, 'target');
        relationIds.add(
          relationId ||
            [this.normalizeName(source), this.normalizeName(target)]
              .sort()
              .join(':'),
        );
      }
      for (const [fieldIndex, field] of fields.entries()) {
        const name = this.recordString(field, 'name');
        const normalized = name.toLowerCase();
        if (!name) continue;
        if (fieldNames.has(normalized)) {
          add(
            'DUPLICATE_ENTITY_FIELD',
            `entities[${entityIndex}].fields[${fieldIndex}]`,
            `${entityName}.${name} is duplicated in the normalized Markdown specification.`,
            'Keep one ERD row per field.',
          );
        }
        fieldNames.add(normalized);
      }
    }

    for (const [endpointIndex, endpoint] of endpoints.entries()) {
      const location = `endpoints[${endpointIndex}]`;
      const method = this.recordString(endpoint, 'method').toUpperCase();
      const endpointPath = this.recordString(endpoint, 'path');
      const route = `${method} ${this.normalizePath(endpointPath)}`;
      if (method && endpointPath) {
        if (routes.has(route)) {
          add(
            'DUPLICATE_OPERATION_ROUTE',
            location,
            `Route ${route} is defined more than once.`,
            'Merge or remove the duplicate endpoint.',
          );
        }
        routes.add(route);
      }

      const requestFields = this.recordArray(endpoint, 'requestFields');
      const responseFields = this.recordArray(endpoint, 'responseFields');
      this.validateNormalizedFieldList(
        requestFields,
        `${location}.requestFields`,
        add,
      );
      this.validateNormalizedFieldList(
        responseFields,
        `${location}.responseFields`,
        add,
      );

      const requestNames = new Set(
        requestFields
          .map((field) => this.recordString(field, 'name'))
          .filter(Boolean),
      );
      for (const name of requestNames) {
        if (SERVER_MANAGED_FIELDS.has(name)) {
          add(
            'SERVER_MANAGED_REQUEST_FIELD',
            `${location}.requestFields`,
            `${route} accepts server-managed field ${name}.`,
            `Remove ${name} from the request and return it only in responses.`,
          );
        }
      }

      const owningEntity = this.findNormalizedEndpointEntity(
        endpoint,
        entities,
      );
      const label = `${this.recordString(endpoint, 'operationName')} ${this.recordString(endpoint, 'description')}`;
      const isCreate =
        method === 'POST' &&
        (CREATE_WORDS.test(label) ||
          (!endpointPath.includes(':') && !endpointPath.includes('{')));
      const requiresCompleteRequest = isCreate || method === 'PUT';
      if (requiresCompleteRequest && owningEntity) {
        for (const field of owningEntity.fields ?? []) {
          const name = this.recordString(field, 'name');
          const required = field.required === true || field.isNotNull === true;
          const primaryKey =
            field.primaryKey === true || field.isPrimaryKey === true;
          if (
            required &&
            !primaryKey &&
            !SERVER_MANAGED_FIELDS.has(name) &&
            !requestNames.has(name)
          ) {
            add(
              isCreate
                ? 'CREATE_REQUIRED_FIELD_MISSING'
                : 'FULL_UPDATE_REQUIRED_FIELD_MISSING',
              `${location}.requestFields`,
              isCreate
                ? `${route} cannot create ${String(owningEntity.name)} because required field ${name} is missing.`
                : `${route}는 PUT 전체 수정이지만 필수 필드 ${String(owningEntity.name)}.${name}가 누락되었습니다.`,
              isCreate
                ? `Add ${name} to the request fields, or explicitly make it optional/server-derived in the ERD.`
                : `${name}를 PUT 요청에 추가하거나 부분 수정 엔드포인트라면 PATCH로 변경하세요.`,
            );
          }
        }
      }

      const requirements = this.recordString(
        endpoint,
        'implementationRequirements',
      );
      for (const field of requestFields) {
        const name = this.recordString(field, 'name');
        if (!name.endsWith('Id')) continue;
        const demandsExistence =
          NOT_FOUND_REQUIREMENT.test(requirements) &&
          new RegExp(`\\b${this.escapeRegExp(name)}\\b`, 'i').test(
            requirements,
          );
        if (!demandsExistence) continue;
        const targetName = this.normalizeName(name.slice(0, -2));
        const entityField = owningEntity?.fields?.find(
          (candidate) => this.recordString(candidate, 'name') === name,
        );
        const reference = this.normalizeName(
          [
            this.recordString(entityField, 'referencesEntityId'),
            this.recordString(entityField, 'references'),
            this.recordString(entityField, 'notes'),
          ].join(' '),
        );
        const hasTarget =
          entityNames.has(targetName) ||
          [...entityNames].some(
            (candidate) =>
              candidate === targetName ||
              (reference.length > 0 && reference.includes(candidate)),
          );
        if (!hasTarget) {
          add(
            'UNRESOLVABLE_EXISTENCE_REQUIREMENT',
            `${location}.implementationRequirements`,
            `${name}의 존재 여부를 확인하도록 요구했지만 대응하는 엔티티 또는 ERD 참조 관계가 없습니다.`,
            `${name.slice(0, -2)} 엔티티와 관계를 추가하거나 존재 여부 확인 요구사항을 제거해 주세요.`,
          );
        }
      }
    }

    return {
      valid: issues.every((issue) => issue.severity !== 'error'),
      issues,
      checked: {
        entities: entities.length,
        relations: relationIds.size,
        operations: endpoints.length,
      },
    };
  }

  private validateNormalizedFieldList(
    fields: Array<Record<string, unknown>>,
    location: string,
    add: (
      code: string,
      location: string,
      message: string,
      suggestion: string,
      severity?: DesignConsistencyIssue['severity'],
    ) => void,
  ) {
    const names = new Set<string>();
    for (const field of fields) {
      const name = this.recordString(field, 'name');
      if (!name) continue;
      if (names.has(name.toLowerCase())) {
        add(
          'DUPLICATE_OPERATION_FIELD_NAME',
          location,
          `Field ${name} is declared more than once.`,
          'Keep each request/response field once.',
        );
      }
      names.add(name.toLowerCase());
    }
  }

  private findNormalizedEndpointEntity(
    endpoint: Record<string, unknown>,
    entities: NormalizedDesignEntity[],
  ) {
    const section = this.normalizeName(this.recordString(endpoint, 'section'));
    const endpointPath = this.recordString(endpoint, 'path');
    const firstPathSegment = this.normalizeName(
      endpointPath.split('/').filter(Boolean)[0] ?? '',
    );
    return entities.find((entity) => {
      const name =
        typeof entity.name === 'string' ? this.normalizeName(entity.name) : '';
      return (
        name === section ||
        name === firstPathSegment ||
        `${name}s` === section ||
        `${name}s` === firstPathSegment ||
        `${name}es` === section ||
        `${name}es` === firstPathSegment
      );
    });
  }

  private recordArray(
    record: Record<string, unknown>,
    key: string,
  ): Array<Record<string, unknown>> {
    const value = record?.[key];
    return Array.isArray(value)
      ? value.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
      : [];
  }

  private recordString(
    record: Record<string, unknown> | undefined,
    key: string,
  ): string {
    const value = record?.[key];
    return typeof value === 'string' ? value.trim() : '';
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private uniqueStrings(values: string[]): string[] {
    return [...new Set(values.filter((value) => typeof value === 'string'))];
  }

  private uniqueCustomFields(
    fields: DesignCustomField[],
    reservedNames: Set<string>,
  ): DesignCustomField[] {
    const names = new Set(
      [...reservedNames].map((name) => name.trim().toLowerCase()),
    );
    return fields.filter((field) => {
      const name = field.name?.trim();
      if (!name || names.has(name.toLowerCase())) return false;
      names.add(name.toLowerCase());
      return true;
    });
  }

  private removeExistenceRequirement(requirements: string, fieldName: string) {
    const fieldPattern = new RegExp(
      `\\b${this.escapeRegExp(fieldName)}\\b`,
      'i',
    );
    return requirements
      .split(/(?<=[.!?。])\s*|\n+/)
      .filter(
        (sentence) =>
          !(
            fieldPattern.test(sentence) && NOT_FOUND_REQUIREMENT.test(sentence)
          ),
      )
      .join(' ')
      .trim();
  }

  private resolveOperationFields(
    entity: DesignEntity,
    fieldIds: string[],
    customFields: DesignCustomField[],
    location: string,
    add: (
      code: string,
      location: string,
      message: string,
      suggestion: string,
      severity?: DesignConsistencyIssue['severity'],
    ) => void,
  ): Array<{ name: string; type: string }> {
    const fields: Array<{ name: string; type: string }> = [];
    const names = new Set<string>();
    const ids = new Set<string>();

    for (const fieldId of fieldIds) {
      if (ids.has(fieldId)) {
        add(
          'DUPLICATE_OPERATION_FIELD_ID',
          location,
          `Field id ${fieldId} appears more than once.`,
          'Keep each request/response field id once.',
        );
      }
      ids.add(fieldId);
      const field = entity.fields?.find(
        (candidate) => candidate.id === fieldId,
      );
      if (!field) {
        add(
          'UNKNOWN_OPERATION_FIELD_ID',
          location,
          `Field id ${fieldId} does not belong to ${entity.name}.`,
          'Select a field id from the operation entity.',
        );
        continue;
      }
      if (!names.has(field.name)) fields.push(field);
      names.add(field.name);
    }

    for (const customField of customFields) {
      const name = customField.name?.trim();
      if (!name) continue;
      if (names.has(name)) {
        add(
          'DUPLICATE_OPERATION_FIELD_NAME',
          location,
          `Field ${name} is declared more than once.`,
          'Remove the duplicate entity/custom field.',
        );
        continue;
      }
      names.add(name);
      fields.push({ name, type: customField.type || 'string' });
    }

    return fields;
  }

  private normalizeName(value: string) {
    return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private normalizePath(value: string) {
    const path = (value ?? '')
      .trim()
      .replace(/\{([^}]+)\}/g, ':$1')
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/, '');
    return path.startsWith('/') ? path || '/' : `/${path}`;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
