import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { execFile } from 'child_process';
import type { Response } from 'express';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { promisify } from 'util';
import { uuidv7 } from 'uuidv7';
import { AccessTokenGuard } from './auth/guards/access-token.guard';
import { BuildService } from './builds/builds.service';
import { TargetFramework } from './builds/types/build.types';
import { DesignConsistencyService } from './design-consistency/design-consistency.service';

const execFileAsync = promisify(execFile);

type GenerateWorkspaceRequest = {
  project?: {
    name?: string;
    description?: string;
    framework?: string;
    database?: string;
    planning?: {
      purpose?: string;
      constraints?: string;
    };
  };
  entities?: Array<{
    id: string;
    name: string;
    fields?: Array<{
      id: string;
      name: string;
      type: string;
      isPrimaryKey?: boolean;
      isNotNull?: boolean;
      isForeignKey?: boolean;
      referencesEntityId?: string;
    }>;
  }>;
  relations?: Array<{
    sourceId: string;
    targetId: string;
    sourceCardinality: string;
    targetCardinality: string;
    direction: string;
    foreignKeyOwnerId?: string;
    foreignKeyFieldName?: string;
  }>;
  operations?: Array<{
    entityId: string;
    kind: string;
    label: string;
    method: string;
    path: string;
    enabled: boolean;
    payloadFieldIds?: string[];
    requestFieldIds?: string[];
    responseFieldIds?: string[];
    requestCustomFields?: Array<{
      name: string;
      type: string;
    }>;
    responseCustomFields?: Array<{
      name: string;
      type: string;
    }>;
    description?: string;
    requirements?: string;
  }>;
};

type ParsedEntity = {
  name: string;
  fields: ParsedField[];
};

type ParsedField = {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isNotNull: boolean;
  isForeignKey: boolean;
};

type ParsedOperation = {
  entityName: string;
  kind: string;
  label: string;
  method: string;
  path: string;
  payload: Array<{
    name: string;
    type: string;
  }>;
};

@Controller('api/generate')
export class GenerateController {
  constructor(
    private readonly buildService: BuildService,
    private readonly designConsistency: DesignConsistencyService,
  ) {}

  @Post('workspace')
  @UseGuards(AccessTokenGuard)
  async createWorkspace(@Body() request: GenerateWorkspaceRequest) {
    const stageReports = (
      ['project', 'planning', 'erd', 'operations'] as const
    ).map((stage) => this.designConsistency.validateTransition(stage, request));
    const issues = Array.from(
      new Map(
        stageReports
          .flatMap((report) => report.issues)
          .map((issue) => [
            `${issue.code}:${issue.location}:${issue.message}`,
            issue,
          ]),
      ).values(),
    );
    const validation = {
      valid: issues.every((issue) => issue.severity !== 'error'),
      issues,
      checked: stageReports.at(-1)?.checked ?? {
        entities: 0,
        relations: 0,
        operations: 0,
      },
    };
    if (!validation.valid) {
      throw new UnprocessableEntityException({
        message:
          '이전 단계와 현재 단계의 설계 교차 검증을 통과하지 못했습니다. 표시된 Project, Planning, ERD 또는 API 항목을 먼저 수정해 주세요.',
        issues: validation.issues,
        checked: validation.checked,
      });
    }

    const workspaceId = uuidv7();
    const workspaceRoot = join(process.cwd(), '.semraz', 'workspaces');
    const workspacePath = join(workspaceRoot, workspaceId);

    await mkdir(workspacePath, { recursive: true });
    await Promise.all([
      writeFile(
        join(workspacePath, 'PROJECT.md'),
        buildProjectMarkdown(request),
        'utf8',
      ),
      writeFile(
        join(workspacePath, 'ERD.md'),
        buildErdMarkdown(request),
        'utf8',
      ),
      writeFile(
        join(workspacePath, 'endpoints.md'),
        buildEndpointsMarkdown(request),
        'utf8',
      ),
      writeFile(
        join(workspacePath, 'rules.md'),
        buildRulesMarkdown(request),
        'utf8',
      ),
    ]);

    return {
      workspaceId,
      workspacePath,
      files: ['PROJECT.md', 'ERD.md', 'endpoints.md', 'rules.md'],
      validation,
    };
  }

  @Delete('workspace/:workspaceId/nestjs')
  @UseGuards(AccessTokenGuard)
  async deleteNestJsApp(@Param('workspaceId') workspaceId: string) {
    this.validateWorkspaceId(workspaceId);

    const appPath = join(
      process.cwd(),
      '.semraz',
      'workspaces',
      workspaceId,
      'nestjs-app',
    );

    try {
      await rm(appPath, { recursive: true, force: true });
    } catch {
      // Directory may not exist — that's fine
    }

    return { deleted: true };
  }

  @Post('workspace/:workspaceId/nestjs')
  @UseGuards(AccessTokenGuard)
  async runNestJsAgent(@Param('workspaceId') workspaceId: string) {
    return this.runNestJsBuild(workspaceId);
  }

  @Get('workspace/:workspaceId/nestjs/events')
  @UseGuards(AccessTokenGuard)
  async streamNestJsAgent(
    @Param('workspaceId') workspaceId: string,
    @Res() response: Response,
  ) {
    this.validateWorkspaceId(workspaceId);

    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();

    let isClosed = false;
    const heartbeat = setInterval(() => {
      if (!isClosed && !response.writableEnded) {
        response.write(': heartbeat\n\n');
      }
    }, 15_000);
    heartbeat.unref();

    response.on('close', () => {
      isClosed = true;
      clearInterval(heartbeat);
    });

    const send = (event: string, data: unknown) => {
      if (isClosed || response.writableEnded) {
        return;
      }

      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send('progress', {
      stage: 'started',
      message: 'Starting NestJS app generation agent',
    });

    try {
      const result = await this.runNestJsBuild(workspaceId, (progressEvent) => {
        send('progress', progressEvent);
      });
      send('result', result);
      send('done', { ok: true });
    } catch (error) {
      send('agent-error', {
        message:
          error instanceof Error
            ? error.message
            : 'Unexpected NestJS generation error.',
      });
    } finally {
      clearInterval(heartbeat);
      if (!isClosed && !response.writableEnded) {
        response.end();
      }
    }
  }

  @Get('workspace/:workspaceId/nestjs/download')
  async downloadNestJsApp(
    @Param('workspaceId') workspaceId: string,
    @Res() response: Response,
  ) {
    this.validateWorkspaceId(workspaceId);

    const workspacePath = join(
      process.cwd(),
      '.semraz',
      'workspaces',
      workspaceId,
    );
    const appPath = join(workspacePath, 'nestjs-app');

    try {
      const appStats = await stat(appPath);

      if (!appStats.isDirectory()) {
        throw new Error('Generated app path is not a directory.');
      }
    } catch {
      throw new NotFoundException('Generated NestJS app was not found.');
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'semraz-nestjs-download-'));
    const zipPath = join(tempDir, `nestjs-app-${workspaceId}.zip`);

    try {
      await execFileAsync(
        'zip',
        [
          '-r',
          '-q',
          zipPath,
          'nestjs-app',
          '-x',
          'nestjs-app/node_modules/*',
          'nestjs-app/dist/*',
          'nestjs-app/coverage/*',
        ],
        { cwd: workspacePath },
      );

      response.download(zipPath, `nestjs-app-${workspaceId}.zip`, () => {
        void rm(tempDir, { recursive: true, force: true });
      });
    } catch (error) {
      await rm(tempDir, { recursive: true, force: true });
      throw error;
    }
  }

  private validateWorkspaceId(workspaceId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
      throw new BadRequestException('Invalid workspace id.');
    }
  }

  private async runNestJsBuild(
    workspaceId: string,
    onProgress?: Parameters<BuildService['build']>[1],
  ) {
    this.validateWorkspaceId(workspaceId);

    const build = await this.buildService.build(
      {
        target: TargetFramework.NestJS,
        projectDir: join('.semraz', 'workspaces', workspaceId),
        outputName: 'nestjs-app',
        workspaceId,
      },
      onProgress,
    );

    return {
      workspaceId,
      appPath: build.outputDir,
      files: build.artifact.files,
      build: build.build,
      spec: build.spec,
      plan: build.plan,
      buildPlan: build.buildPlan,
      completedTasks: build.completedTasks,
      repairAttempts: build.repairAttempts,
      finalRepairAttempts: build.finalRepairAttempts,
      completedEntities: build.completedEntities,
    };
  }
}

function buildProjectMarkdown(request: GenerateWorkspaceRequest) {
  const project = request.project;

  return `# ${project?.name ?? 'Untitled Semraz Project'}

## Product Brief
${project?.description ?? ''}

## Description
${project?.description ?? ''}

## Target
- Framework: ${project?.framework ?? 'NestJS'}
- Database: ${project?.database ?? 'PostgreSQL'}
- Language: TypeScript

## Purpose
${project?.planning?.purpose ?? ''}

## Code Conventions and Constraints
${project?.planning?.constraints ?? ''}

## Generation Boundary
- Use PROJECT.md, ERD.md, endpoints.md, and rules.md as the reviewed design input.
- Do not invent entities or APIs that contradict the reviewed Semraz steps.
- Generated code must compile before tests or workflow implementation are considered complete.
`;
}

export function buildErdMarkdown(request: GenerateWorkspaceRequest) {
  const entities = request.entities ?? [];
  const relations = request.relations ?? [];
  const entityNameById = new Map(
    entities.map((entity) => [entity.id, entity.name]),
  );

  const entitySections = entities
    .map((entity) => {
      const fields = entity.fields ?? [];
      const fieldRows = fields
        .map((field) => {
          const reference = field.referencesEntityId
            ? (entityNameById.get(field.referencesEntityId) ??
              field.referencesEntityId)
            : '-';

          return `| ${[
            field.name,
            field.type,
            field.isPrimaryKey ? 'yes' : 'no',
            field.isNotNull ? 'yes' : 'no',
            field.isForeignKey ? 'yes' : 'no',
            reference,
          ].join(' | ')} |`;
        })
        .join('\n');

      return `## Entity: ${entity.name}

| Column | Type | PK | NN | FK | References |
| --- | --- | --- | --- | --- | --- |
${fieldRows || '| _none_ | string | no | no | no | - |'}
`;
    })
    .join('\n');

  const relationRows = relations
    .map((relation) => {
      const source =
        entities.find((entity) => entity.id === relation.sourceId)?.name ??
        relation.sourceId;
      const target =
        entities.find((entity) => entity.id === relation.targetId)?.name ??
        relation.targetId;

      return `- ${source} ${relation.sourceCardinality}:${relation.targetCardinality} ${target} (${relation.direction})`;
    })
    .join('\n');

  return `# ERD

${entitySections}
## Relationships

${relationRows || '- No explicit relationships yet.'}
`;
}

function buildEndpointsMarkdown(request: GenerateWorkspaceRequest) {
  const entities = request.entities ?? [];
  const operations = request.operations ?? [];

  const sections = entities
    .map((entity) => {
      const endpointRows = operations
        .filter(
          (operation) => operation.enabled && operation.entityId === entity.id,
        )
        .map((operation) => {
          const requestFields = describeOperationFields(
            entity,
            operation.requestFieldIds && operation.requestFieldIds.length > 0
              ? operation.requestFieldIds
              : (operation.payloadFieldIds ?? []),
            operation.requestCustomFields ?? [],
          );
          const responseFields = describeOperationFields(
            entity,
            operation.responseFieldIds ?? [],
            operation.responseCustomFields ?? [],
          );

          return [
            `### ${operation.label}`,
            '',
            `- \`${operation.method.toUpperCase()} ${operation.path}\` ${operation.description ?? ''}`.trimEnd(),
            '',
            '#### Description',
            operation.description?.trim() || '-',
            '',
            '#### Implementation Requirements',
            operation.requirements?.trim() || '-',
            '',
            '#### Request Fields',
            requestFields || '- none',
            '',
            '#### Response Fields',
            responseFields || '- none',
          ].join('\n');
        })
        .join('\n');

      return `## ${pluralizeLabel(entity.name)}

${endpointRows || '- No endpoints selected yet.'}
`;
    })
    .join('\n');

  return `# Endpoints

Each endpoint is generated from the Semraz Operations step. Keep method, path, request fields, response fields, and description aligned with this file.

${sections}
`;
}

function describeOperationFields(
  entity: NonNullable<GenerateWorkspaceRequest['entities']>[number],
  fieldIds: string[],
  customFields: Array<{ name: string; type: string }>,
) {
  const entityFields = fieldIds
    .map((fieldId) => entity.fields?.find((field) => field.id === fieldId))
    .filter((field): field is NonNullable<typeof field> => Boolean(field))
    .map((field) => `- ${field.name}: ${field.type}`);
  const operationFields = customFields
    .filter((field) => field.name.trim())
    .map((field) => `- ${field.name.trim()}: ${field.type.trim() || 'string'}`);

  return [...entityFields, ...operationFields].join('\n');
}

function buildRulesMarkdown(request: GenerateWorkspaceRequest) {
  const project = request.project;
  const enabledOperations = (request.operations ?? [])
    .filter((operation) => operation.enabled)
    .map(
      (operation) =>
        `- Implement ${operation.label} via ${operation.method.toUpperCase()} ${operation.path}`,
    )
    .join('\n');

  return `# Rules

- Framework must be NestJS.
- Database target is ${project?.database ?? 'PostgreSQL'} in the Semraz spec; generated local verification may use SQL.js.
- Generated code must compile before it is treated as ready.
- Respect the Project, Planning, ERD, and Operations markdown files as the ordered design source.
${project?.planning?.constraints ?? ''}
${enabledOperations}
`;
}

function pluralizeLabel(value: string) {
  if (value.endsWith('y')) {
    return `${value.slice(0, -1)}ies`;
  }

  return `${value}s`;
}

function parseProjectName(markdown: string) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || 'semraz-generated-api';
}

function parseEntities(markdown: string) {
  const entities: ParsedEntity[] = [];
  const sections = markdown.split(/\n##\s+/).slice(1);

  for (const section of sections) {
    const [rawName, ...rest] = section.split('\n');
    const name = rawName.trim().replace(/^Entity:\s*/i, '');

    if (!name || name === 'Relations') {
      continue;
    }

    const rows = parseMarkdownRows(rest.join('\n'));
    const fields = rows
      .filter((row) => row[0] && row[0] !== '_none_')
      .map((row) => ({
        name: row[0],
        type: row[1],
        isPrimaryKey: row[2] === 'yes',
        isNotNull: row[3] === 'yes',
        isForeignKey: row[4] === 'yes',
      }));

    entities.push({ name, fields });
  }

  return entities;
}

function parseOperations(markdown: string) {
  return parseMarkdownRows(markdown)
    .filter((row) => row[0] && row[0] !== '_none_')
    .map((row) => ({
      entityName: row[0],
      kind: row[1],
      label: row[2],
      method: row[3],
      path: row[4],
      payload:
        row[5] === '-'
          ? []
          : row[5].split(',').map((field) => {
              const [name, type] = field.trim().split(':');

              return { name, type };
            }),
    }));
}

function parseMarkdownRows(markdown: string) {
  return markdown
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .filter((line) => !line.includes('---'))
    .filter(
      (line) => !line.includes('| Column |') && !line.includes('| Entity |'),
    )
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

async function generateNestJsApplication({
  appPath,
  projectName,
  entities,
  operations,
}: {
  appPath: string;
  projectName: string;
  entities: ParsedEntity[];
  operations: ParsedOperation[];
}) {
  const files = new Map<string, string>();
  const moduleImports = entities
    .map(
      (entity) =>
        `import { ${toPascalCase(entity.name)}Module } from './${toKebabCase(entity.name)}/${toKebabCase(entity.name)}.module';`,
    )
    .join('\n');
  const moduleNames = entities
    .map((entity) => `${toPascalCase(entity.name)}Module`)
    .join(', ');

  files.set('package.json', buildGeneratedPackageJson(projectName));
  files.set('tsconfig.json', buildGeneratedTsConfig());
  files.set('src/main.ts', buildGeneratedMain());
  files.set(
    'src/app.module.ts',
    `import { Module } from '@nestjs/common';
${moduleImports}

@Module({
  imports: [${moduleNames}],
})
export class AppModule {}
`,
  );

  for (const entity of entities) {
    const entityOperations = operations.filter(
      (operation) => operation.entityName === entity.name,
    );
    const folder = `src/${toKebabCase(entity.name)}`;
    const dtoFolder = `${folder}/dto`;

    files.set(
      `${folder}/${toKebabCase(entity.name)}.module.ts`,
      buildEntityModule(entity),
    );
    files.set(
      `${folder}/${toKebabCase(entity.name)}.service.ts`,
      buildEntityService(entity),
    );
    files.set(
      `${folder}/${toKebabCase(entity.name)}.controller.ts`,
      buildEntityController(entity, entityOperations),
    );
    files.set(
      `${dtoFolder}/create-${toKebabCase(entity.name)}.dto.ts`,
      buildDto(entity, 'Create'),
    );
    files.set(
      `${dtoFolder}/update-${toKebabCase(entity.name)}.dto.ts`,
      buildDto(entity, 'Update'),
    );
  }

  await Promise.all(
    [...files.entries()].map(async ([relativePath, contents]) => {
      const fullPath = join(appPath, relativePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, contents, 'utf8');
    }),
  );

  return [...files.keys()];
}

function buildGeneratedPackageJson(projectName: string) {
  return `${JSON.stringify(
    {
      name: toKebabCase(projectName),
      version: '0.1.0',
      private: true,
      scripts: {
        start: 'nest start',
        'start:dev': 'nest start --watch',
        build: 'nest build',
      },
      dependencies: {
        '@nestjs/common': '^11.0.1',
        '@nestjs/core': '^11.0.1',
        '@nestjs/platform-express': '^11.0.1',
        'reflect-metadata': '^0.2.2',
        rxjs: '^7.8.1',
      },
      devDependencies: {
        '@nestjs/cli': '^11.0.0',
        '@types/node': '^24.0.0',
        'ts-node': '^10.9.2',
        typescript: '^5.7.3',
      },
    },
    null,
    2,
  )}
`;
}

function buildGeneratedTsConfig() {
  return `${JSON.stringify(
    {
      compilerOptions: {
        module: 'nodenext',
        moduleResolution: 'nodenext',
        target: 'ES2023',
        outDir: './dist',
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
        strictNullChecks: true,
        skipLibCheck: true,
      },
    },
    null,
    2,
  )}
`;
}

function buildGeneratedMain() {
  return `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
`;
}

function buildEntityModule(entity: ParsedEntity) {
  const pascalName = toPascalCase(entity.name);
  const kebabName = toKebabCase(entity.name);

  return `import { Module } from '@nestjs/common';
import { ${pascalName}Controller } from './${kebabName}.controller';
import { ${pascalName}Service } from './${kebabName}.service';

@Module({
  controllers: [${pascalName}Controller],
  providers: [${pascalName}Service],
})
export class ${pascalName}Module {}
`;
}

function buildEntityService(entity: ParsedEntity) {
  const pascalName = toPascalCase(entity.name);
  const camelName = toCamelCase(entity.name);

  return `import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Create${pascalName}Dto } from './dto/create-${toKebabCase(entity.name)}.dto';
import { Update${pascalName}Dto } from './dto/update-${toKebabCase(entity.name)}.dto';

@Injectable()
export class ${pascalName}Service {
  private readonly ${camelName}Items: Array<Record<string, unknown>> = [];

  create(payload: Create${pascalName}Dto) {
    const record = { id: randomUUID(), ...payload };
    this.${camelName}Items.push(record);
    return record;
  }

  findAll() {
    return this.${camelName}Items;
  }

  findOne(id: string) {
    return this.${camelName}Items.find((item) => item.id === id) ?? null;
  }

  update(id: string, payload: Update${pascalName}Dto) {
    const index = this.${camelName}Items.findIndex((item) => item.id === id);

    if (index === -1) {
      return null;
    }

    this.${camelName}Items[index] = { ...this.${camelName}Items[index], ...payload };
    return this.${camelName}Items[index];
  }

  remove(id: string) {
    const index = this.${camelName}Items.findIndex((item) => item.id === id);

    if (index === -1) {
      return null;
    }

    const [removed] = this.${camelName}Items.splice(index, 1);
    return removed;
  }

  runAction(action: string, payload: Record<string, unknown>) {
    return { action, accepted: true, payload };
  }
}
`;
}

function buildEntityController(
  entity: ParsedEntity,
  operations: ParsedOperation[],
) {
  const pascalName = toPascalCase(entity.name);
  const kebabName = toKebabCase(entity.name);
  const methods = operations
    .map((operation, index) => buildControllerMethod(operation, index))
    .join('\n\n');

  return `import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { Create${pascalName}Dto } from './dto/create-${kebabName}.dto';
import { Update${pascalName}Dto } from './dto/update-${kebabName}.dto';
import { ${pascalName}Service } from './${kebabName}.service';

@Controller()
export class ${pascalName}Controller {
  constructor(private readonly service: ${pascalName}Service) {}

${methods || '  // No enabled operations were selected for this entity yet.'}
}
`;
}

function buildControllerMethod(operation: ParsedOperation, index: number) {
  const method = operation.method.toUpperCase();
  const decorator = toDecoratorName(method);
  const route = operation.path.replace(/^\//, '');
  const methodName = `${toCamelCase(operation.label)}${index + 1}`;
  const hasId = route.includes(':id');
  const hasPayload =
    operation.payload.length > 0 || ['POST', 'PUT', 'PATCH'].includes(method);
  const params = [
    hasId ? "@Param('id') id: string" : '',
    hasPayload
      ? `@Body() payload: ${operation.kind === 'crud' && operation.label === 'Create' ? 'Create' : 'Update'}${toPascalCase(operation.entityName)}Dto`
      : '',
  ].filter(Boolean);
  const serviceCall = buildServiceCall(operation, hasId, hasPayload);

  return `  @${decorator}('${route}')
  ${methodName}(${params.join(', ')}) {
    ${serviceCall}
  }`;
}

function buildServiceCall(
  operation: ParsedOperation,
  hasId: boolean,
  hasPayload: boolean,
) {
  const label = operation.label.toLowerCase();

  if (label === 'create') {
    return 'return this.service.create(payload);';
  }

  if (label === 'list') {
    return 'return this.service.findAll();';
  }

  if (label === 'detail') {
    return 'return this.service.findOne(id);';
  }

  if (label === 'update') {
    return 'return this.service.update(id, payload);';
  }

  if (label === 'delete') {
    return 'return this.service.remove(id);';
  }

  return `return this.service.runAction('${toKebabCase(operation.label)}', ${
    hasPayload ? 'payload' : '{}'
  });${hasId ? ' // id is available for future action routing.' : ''}`;
}

function buildDto(entity: ParsedEntity, mode: 'Create' | 'Update') {
  const fields = entity.fields
    .filter((field) => !field.isPrimaryKey)
    .map(
      (field) =>
        `  ${field.name}${mode === 'Update' || !field.isNotNull ? '?' : ''}: ${toTypeScriptType(field.type)};`,
    )
    .join('\n');

  return `export class ${mode}${toPascalCase(entity.name)}Dto {
${fields || '  // No writable fields yet.'}
}
`;
}

function toDecoratorName(method: string) {
  const decorators: Record<string, string> = {
    DELETE: 'Delete',
    GET: 'Get',
    PATCH: 'Patch',
    POST: 'Post',
    PUT: 'Put',
  };

  return decorators[method] ?? 'Post';
}

function toTypeScriptType(type: string) {
  const types: Record<string, string> = {
    boolean: 'boolean',
    datetime: 'string',
    enum: 'string',
    int: 'number',
    string: 'string',
    uuid: 'string',
  };

  return types[type] ?? 'unknown';
}

function toPascalCase(value: string) {
  return value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function toCamelCase(value: string) {
  const pascal = toPascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toKebabCase(value: string) {
  return (
    value
      .trim()
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'semraz-app'
  );
}
