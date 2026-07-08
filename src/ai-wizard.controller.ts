import { Body, Controller, Post } from '@nestjs/common';
import { OpenAiJsonClient } from './builds/llm/openai-json.client';

type AiWizardStep = 'project' | 'planning' | 'erd' | 'operations';

type AiWizardRequest = {
  step: AiWizardStep;
  language?: 'en' | 'ko';
  project?: Record<string, unknown>;
  entities?: Array<Record<string, unknown>>;
  relations?: Array<Record<string, unknown>>;
  operations?: Array<Record<string, unknown>>;
};

@Controller('api/ai')
export class AiWizardController {
  constructor(private readonly llm: OpenAiJsonClient) {}

  @Post('wizard')
  async generateWizardDraft(@Body() request: AiWizardRequest) {
    const includeCurrentState = request.step !== 'project';
    const currentState = buildCurrentState(request);

    const draft = await this.llm.generateJson({
      system: [
        'You are Semraz AI Wizard, a senior backend architect for a design-first NestJS backend generator.',
        'Return only valid JSON. Do not include markdown fences.',
        'Use concise, implementation-ready names. Prefer uuid ids, camelCase fields, and explicit PK/NN/FK flags.',
        'Never include explanations outside the requested JSON shape.',
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
      temperature: request.step === 'project' ? 0.9 : 0.2,
    });

    if (request.step === 'erd') {
      return sanitizeErdDraft(draft as Record<string, unknown>);
    }

    return draft;
  }
}

function buildLanguageInstruction(language: AiWizardRequest['language']) {
  if (language === 'ko') {
    return [
      'Output language: Korean.',
      'All user-facing natural-language values must be written in Korean, including project descriptions, planning purpose, constraints, operation labels, and operation descriptions.',
      'Keep code identifiers in conventional English: ids, entity ids, field names, API paths, HTTP methods, enum values, and JSON property names must remain ASCII/camelCase/kebab-case as appropriate.',
      'Entity names may remain concise English domain model names such as User, Order, HealthMetric, Project, and Task.',
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
      confirmedPlanning: (request.project as { planning?: unknown } | undefined)?.planning,
    };
  }

  if (request.step === 'operations') {
    return {
      confirmedProject: request.project,
      confirmedPlanning: (request.project as { planning?: unknown } | undefined)?.planning,
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
      'Vary the domain across attempts, such as healthcare operations, logistics, education, fintech, creator tools, HR, IoT, hospitality, or B2B SaaS.',
      'The draft should describe a concrete initial backend product idea clearly.',
    ].join('\n');
  }

  if (step === 'planning') {
    return [
      'Create planning content from the confirmed Project step only.',
      'Return JSON shape:',
      '{ "planning": { "purpose": string, "constraints": string } }',
      'The purpose must explicitly reflect the confirmed project name, description, framework, and database.',
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
      'Every entity must have an id uuid primary key field. Add useful FK fields that match relations.',
      'When an entity has a field like userId, orderId, projectId, or another <entityName>Id field, create the matching relation to that entity.',
      'For owner-style domain pairs such as User -> HealthMetric, User -> Profile, Customer -> Order, Project -> Task, create a 1:N relation unless the domain clearly requires 1:1.',
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
    'BackendOperation shape: { "id": string, "entityId": string, "kind": "crud" | "custom", "label": string, "method": "GET" | "POST" | "PUT" | "PATCH" | "DELETE", "path": string, "enabled": boolean, "payloadFieldIds": string[], "requestFieldIds": string[], "responseFieldIds": string[], "requestCustomFields": CustomField[], "responseCustomFields": CustomField[], "description": string }',
    'CustomField shape: { "id": string, "name": string, "type": string }',
    'Include normal CRUD-style APIs and 1-3 high-value domain workflow APIs when the domain suggests them.',
    'Use only entityId and field ids that exist in the provided ERD.',
    'API descriptions must reflect the confirmed project purpose and planning constraints.',
    'Do not introduce new entities or fields. Use the confirmed ERD exactly.',
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
    const entityId = normalizeId(stringValue(entity.id) || stringValue(entity.name) || `entity_${entityIndex + 1}`);
    const rawFields = Array.isArray(entity.fields)
      ? (entity.fields.filter(isRecord) as ErdDraftRecord[])
      : [];
    const fields = rawFields.map((field, fieldIndex) => {
      const fieldName = sanitizeFieldName(stringValue(field.name)) || (fieldIndex === 0 ? 'id' : `field${fieldIndex + 1}`);

      return {
        id: normalizeId(stringValue(field.id) || `${entityId}_${fieldName}`),
        name: fieldName,
        type: normalizeFieldType(stringValue(field.type)),
        isPrimaryKey: Boolean(field.isPrimaryKey) || fieldName === 'id',
        isNotNull: Boolean(field.isNotNull) || Boolean(field.isPrimaryKey) || fieldName === 'id',
        ...(Boolean(field.isForeignKey) ? { isForeignKey: true } : {}),
        ...(stringValue(field.referencesEntityId) ? { referencesEntityId: stringValue(field.referencesEntityId) } : {}),
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

  const resolveEntityId = (value: unknown) => lookup.get(stringValue(value).toLowerCase()) ?? '';

  entities.forEach((entity) => {
    entity.fields = entity.fields.map((field) => {
      const referencesEntityId = resolveEntityId(field.referencesEntityId);

      if (!field.isForeignKey || !referencesEntityId || referencesEntityId === entity.id) {
        const { isForeignKey, referencesEntityId: _referencesEntityId, ...plainField } = field;
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
    const relationKey = `${sourceId}:${targetId}:${sourceCardinality}:${targetCardinality}`;

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
      requestedOwnerId === sourceId || requestedOwnerId === targetId ? requestedOwnerId : inferredOwnerId;
    const referencedEntityId = foreignKeyOwnerId === sourceId ? targetId : sourceId;
    const ownerEntity = entityById.get(foreignKeyOwnerId);
    const referencedEntity = entityById.get(referencedEntityId);

    if (!ownerEntity || !referencedEntity) {
      return validRelations;
    }

    const foreignKeyFieldName =
      sanitizeFieldName(stringValue(relation.foreignKeyFieldName)) || toForeignKeyName(referencedEntity.name);
    const existingField = ownerEntity.fields.find((field) => field.name === foreignKeyFieldName);

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

  const relations = rawRelations.reduce<Array<Record<string, unknown>>>(addRelation, []);

  entities.forEach((entity) => {
    entity.fields.forEach((field, fieldIndex) => {
      const referencedEntityId =
        resolveEntityId(field.referencesEntityId) || inferReferencedEntityIdFromField(field.name, entity.id, lookup);

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
    relations.map((relation) => `${relation.foreignKeyOwnerId}:${relation.foreignKeyFieldName}`),
  );

  return {
    entities: entities.map((entity) => ({
      ...entity,
      fields: entity.fields.map((field) => {
        if (!field.isForeignKey || relationForeignKeys.has(`${entity.id}:${field.name}`)) {
          return field;
        }

        const { isForeignKey, referencesEntityId: _referencesEntityId, ...plainField } = field;
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
  return ['uuid', 'string', 'int', 'datetime', 'boolean', 'enum'].includes(value) ? value : 'string';
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

function inferReferencedEntityIdFromField(fieldName: string, ownerEntityId: string, lookup: Map<string, string>) {
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
