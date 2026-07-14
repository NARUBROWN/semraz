import { Injectable } from '@nestjs/common';
import {
  AppSpec,
  BuildPlan,
  BuildTask,
  CodeContext,
  CommandSpec,
  EntitySpec,
  GeneratedFile,
  TargetFramework,
} from '../types/build.types';
import { TypeScriptLanguageAdapter } from '../languages/typescript-language.adapter';
import { WorkspaceWriter } from '../runtime/workspace-writer';
import { TargetAdapter } from './target-adapter';

type EndpointSpec = {
  method: string;
  path: string;
  operationName?: string;
  description?: string;
  requestFields?: Array<Record<string, unknown>>;
  responseFields?: Array<Record<string, unknown>>;
};

type RelationSkeleton = {
  source: string;
  target: string;
  declaration: Record<string, unknown>;
};

const RELATION_MAP_BATCH_SIZE = 10;

@Injectable()
export class NestJsTargetAdapter implements TargetAdapter {
  readonly target = TargetFramework.NestJS;

  constructor(readonly language: TypeScriptLanguageAdapter) {}

  readonly planningGuidance =
    'Plan a minimal but complete NestJS TypeScript backend shell first. Entity feature modules will be added later by an entity implementation loop.';

  readonly bootstrapGuidance = [
    'Generate a buildable NestJS TypeScript backend shell.',
    'Include package.json, tsconfig files, nest-cli.json, src/main.ts, src/app.module.ts, .env.example, and README.md.',
    'Use NestJS 10, TypeScript 5, @types/node 22, reflect-metadata 0.2, class-validator 0.14, class-transformer 0.5, @nestjs/typeorm 10, typeorm 0.3, pg, and sql.js.',
    'Use "nest build" for the build script, not plain "tsc".',
    'Do not implement business entities yet unless required for the app to compile.',
    'Set up validation pipe and a simple health endpoint or root endpoint.',
    'Set up a complete OpenAPI contract and reject unknown request properties.',
    'Include scripts for build, start, and E2E verification.',
  ].join('\n');

  bootstrapFiles(spec: AppSpec): GeneratedFile[] {
    const productionDatabase = this.productionDatabaseType(spec);
    const projectSlug = this.toKebabCase(
      spec.projectName || 'generated-backend',
    );
    const files: GeneratedFile[] = [
      {
        path: 'package.json',
        content: JSON.stringify(
          {
            name: projectSlug,
            version: '0.1.0',
            private: true,
            scripts: {
              build: 'nest build',
              start: 'node dist/main.js',
              'start:dev': 'nest start --watch',
              typecheck: 'tsc --noEmit',
            },
            dependencies: {
              '@nestjs/common': '^10.4.15',
              '@nestjs/core': '^10.4.15',
              '@nestjs/platform-express': '^10.4.15',
              '@nestjs/swagger': '^7.4.2',
              '@nestjs/typeorm': '^10.0.2',
              'class-transformer': '^0.5.1',
              'class-validator': '^0.14.1',
              'reflect-metadata': '^0.2.2',
              rxjs: '^7.8.1',
              'sql.js': '^1.12.0',
              pg: '^8.13.1',
              mysql2: '^3.11.5',
              typeorm: '^0.3.20',
            },
            devDependencies: {
              '@nestjs/cli': '^10.4.8',
              '@nestjs/schematics': '^10.2.3',
              '@nestjs/testing': '^10.4.15',
              '@types/node': '^22.10.2',
              typescript: '^5.7.2',
            },
          },
          null,
          2,
        ),
      },
      {
        path: 'tsconfig.json',
        content: JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'Node16',
              moduleResolution: 'node16',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              forceConsistentCasingInFileNames: true,
              outDir: './dist',
              rootDir: 'src',
              experimentalDecorators: true,
              emitDecoratorMetadata: true,
              strictPropertyInitialization: false,
              sourceMap: true,
            },
            include: ['src/**/*'],
            exclude: ['node_modules', 'dist'],
          },
          null,
          2,
        ),
      },
      {
        path: 'tsconfig.build.json',
        content: JSON.stringify(
          {
            extends: './tsconfig.json',
            exclude: ['node_modules', 'dist', 'test', '**/*spec.ts'],
          },
          null,
          2,
        ),
      },
      {
        path: 'nest-cli.json',
        content: JSON.stringify(
          {
            collection: '@nestjs/schematics',
            sourceRoot: 'src',
            compilerOptions: {
              deleteOutDir: true,
              plugins: [
                {
                  name: '@nestjs/swagger',
                  options: {
                    classValidatorShim: true,
                    dtoFileNameSuffix: ['.dto.ts'],
                  },
                },
              ],
            },
          },
          null,
          2,
        ),
      },
      {
        path: 'src/main.ts',
        content: [
          "import { ValidationPipe } from '@nestjs/common';",
          "import { NestFactory } from '@nestjs/core';",
          "import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';",
          "import { AppModule } from './app.module';",
          '',
          'async function bootstrap() {',
          '  const app = await NestFactory.create(AppModule);',
          '  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));',
          '',
          '  const config = new DocumentBuilder()',
          `    .setTitle('${this.escapeSingleQuote(spec.projectName || 'Generated Backend')}')`,
          "    .setDescription('Generated backend API')",
          "    .setVersion('0.1.0')",
          '    .build();',
          '  const document = SwaggerModule.createDocument(app, config);',
          "  SwaggerModule.setup('docs', app, document);",
          '',
          "  const port = Number(process.env.PORT ?? '3000');",
          "  await app.listen(port, '0.0.0.0');",
          '}',
          '',
          'void bootstrap();',
          '',
        ].join('\n'),
      },
      {
        path: 'src/app.module.ts',
        content: [
          "import { Module } from '@nestjs/common';",
          "import { TypeOrmModule } from '@nestjs/typeorm';",
          "import { AppController } from './app.controller';",
          '',
          'const databaseConfig = process.env.DATABASE_URL',
          '  ? {',
          `      type: '${productionDatabase}' as const,`,
          '      url: process.env.DATABASE_URL,',
          '      synchronize: false,',
          '      autoLoadEntities: true,',
          '      retryAttempts: 1,',
          '    }',
          '  : {',
          "      type: 'sqljs' as const,",
          '      autoSave: false,',
          '      synchronize: true,',
          '      autoLoadEntities: true,',
          '      retryAttempts: 1,',
          '    };',
          '',
          '@Module({',
          '  imports: [',
          '    TypeOrmModule.forRoot(databaseConfig),',
          '  ],',
          '  controllers: [AppController],',
          '  providers: [],',
          '})',
          'export class AppModule {}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/app.controller.ts',
        content: [
          "import { Controller, Get } from '@nestjs/common';",
          "import { ApiTags } from '@nestjs/swagger';",
          '',
          "@ApiTags('health')",
          '@Controller()',
          'export class AppController {',
          "  @Get('health')",
          '  health() {',
          "    return { status: 'ok' };",
          '  }',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: '.env.example',
        content: [
          'PORT=3000',
          productionDatabase === 'mysql'
            ? 'DATABASE_URL=mysql://root:root@localhost:3306/app'
            : 'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app',
          '',
        ].join('\n'),
      },
      {
        path: 'README.md',
        content: [
          `# ${spec.projectName || 'Generated Backend'}`,
          '',
          'Generated NestJS backend application.',
          '',
          '## Commands',
          '',
          '- `npm install`',
          '- `npm run build`',
          '- `npm run start`',
          '',
          'Swagger is available at `/docs` when the app is running.',
          '',
        ].join('\n'),
      },
    ];

    return this.normalizeGeneratedFiles(files);
  }

  planBuildTasks(spec: AppSpec): BuildPlan {
    const tasks: BuildTask[] = [];

    for (const entity of spec.entities) {
      tasks.push(this.entityFieldsTask(entity));
    }

    const entityFieldTaskIds = spec.entities.map(
      (entity) => `entity-${this.toKebabCase(entity.name)}-fields`,
    );
    const relationSkeleton = this.relationSkeleton(spec.entities);
    const relationBatches = this.chunk(
      relationSkeleton,
      RELATION_MAP_BATCH_SIZE,
    );
    const relationTaskIds = relationBatches.map((_batch, index) =>
      relationBatches.length === 1
        ? 'entity-relations'
        : `entity-relations-map-${index + 1}`,
    );
    relationBatches.forEach((batch, index) => {
      tasks.push(
        this.entityRelationsTask(
          batch,
          entityFieldTaskIds,
          relationTaskIds[index],
          index + 1,
          relationBatches.length,
        ),
      );
    });

    if (spec.entities.length > 0) {
      tasks.push(this.ormRegistrationTask(spec, relationTaskIds));
    }

    for (const entity of spec.entities.filter(
      (candidate) => candidate.endpoints.length > 0,
    )) {
      tasks.push(this.crudFeatureTask(entity, spec.entities));
    }

    for (const entity of spec.entities) {
      const nonCrudEndpoints = this.nonCrudEndpoints(entity);
      if (nonCrudEndpoints.length > 0) {
        tasks.push(
          this.endpointWorkflowTask(entity, spec.entities, nonCrudEndpoints),
        );
      }
    }

    return { tasks };
  }

  taskContextHints(task: BuildTask): string[] {
    const hints = [
      'AppModule',
      '@Module',
      '@Controller',
      '@Injectable',
      'TypeOrmModule',
      'Repository',
    ];
    if (task.targetEntity) {
      hints.push(
        task.targetEntity.toLowerCase(),
        this.toKebabCase(task.targetEntity),
        `${this.toPascalCase(task.targetEntity)}Module`,
        `${this.toPascalCase(task.targetEntity)}Controller`,
        `${this.toPascalCase(task.targetEntity)}Service`,
      );
    }
    return hints;
  }

  requiredTaskFiles(task: BuildTask): string[] {
    switch (task.kind) {
      case 'entity-fields':
      case 'entity-relations':
        return task.allowedFiles;
      case 'orm-registration':
        return ['src/app.module.ts'];
      case 'crud-feature':
        return task.allowedFiles;
      case 'endpoint-workflow':
        return task.allowedFiles.filter(
          (file) =>
            file.endsWith('.controller.ts') || file.endsWith('.service.ts'),
        );
      case 'business-workflow':
        return task.allowedFiles.filter(
          (file) =>
            file === 'src/app.module.ts' ||
            file.endsWith('.module.ts') ||
            file.endsWith('.controller.ts') ||
            file.endsWith('.service.ts'),
        );
      default:
        return [];
    }
  }

  validateTaskFiles(params: {
    spec: AppSpec;
    task: BuildTask;
    files: GeneratedFile[];
  }): string[] {
    const problems: string[] = [];
    const byPath = new Map(
      params.files.map((file) => [file.path, file.content]),
    );
    const entity = params.task.targetEntity
      ? params.spec.entities.find(
          (candidate) => candidate.name === params.task.targetEntity,
        )
      : undefined;

    if (params.task.kind === 'entity-fields' && entity) {
      const slug = this.toKebabCase(entity.name);
      const content = byPath.get(`src/${slug}/${slug}.entity.ts`) ?? '';
      for (const field of entity.fields.filter(
        (candidate) => candidate.required === true,
      )) {
        const name = typeof field.name === 'string' ? field.name : '';
        if (!name) continue;
        if (!new RegExp(`\\b${name}[!]?:\\s*`).test(content)) {
          problems.push(`${entity.name}.${name} must be a required property`);
        }
        const column = content.match(
          new RegExp(`@Column\\(([^)]*)\\)\\s*${name}[!?]?:`, 'm'),
        )?.[1];
        if (column && /nullable\s*:\s*true/.test(column)) {
          problems.push(`${entity.name}.${name} cannot be nullable`);
        }
      }
      for (const [fieldName, decorator] of [
        ['createdAt', 'CreateDateColumn'],
        ['updatedAt', 'UpdateDateColumn'],
      ] as const) {
        if (
          entity.fields.some((field) => field.name === fieldName) &&
          !new RegExp(`@${decorator}\\([^)]*\\)\\s*${fieldName}[!]?:`).test(
            content,
          )
        ) {
          problems.push(
            `${entity.name}.${fieldName} must use @${decorator} so it is server-managed`,
          );
        }
      }
    }

    if (
      entity &&
      (params.task.kind === 'crud-feature' ||
        params.task.kind === 'endpoint-workflow')
    ) {
      const slug = this.toKebabCase(entity.name);
      const controller = byPath.get(`src/${slug}/${slug}.controller.ts`) ?? '';
      const base =
        controller.match(/@Controller\(\s*['"]([^'"]*)['"]\s*\)/)?.[1] ?? '';
      const routes = this.controllerRoutes(controller, base);
      const expected = entity.endpoints
        .filter((endpoint): endpoint is EndpointSpec =>
          Boolean(endpoint.method && endpoint.path),
        )
        .filter((endpoint) =>
          params.task.kind === 'crud-feature'
            ? this.isConventionalCrudEndpoint(entity, endpoint)
            : true,
        );
      const expectedRoutes = new Set(
        expected.map(
          (endpoint) =>
            `${endpoint.method.toUpperCase()} ${this.normalizeEndpointPath(endpoint.path)}`,
        ),
      );
      for (const endpoint of expected) {
        const signature = `${endpoint.method.toUpperCase()} ${this.normalizeEndpointPath(endpoint.path)}`;
        if (!routes.has(signature)) {
          problems.push(`controller is missing ${signature}`);
        }
      }
      for (const route of routes) {
        if (!expectedRoutes.has(route)) {
          problems.push(
            `controller exposes API not present in the endpoint skeleton: ${route}`,
          );
        }
      }
      if (expected.length > 0 && !/@ApiTags\s*\(/.test(controller)) {
        problems.push(`${entity.name} controller must declare @ApiTags`);
      }
      const operationCount = (controller.match(/@ApiOperation\s*\(/g) ?? [])
        .length;
      if (operationCount < expected.length) {
        problems.push(
          `${entity.name} controller must document every route with @ApiOperation`,
        );
      }
      const responseCount = (
        controller.match(
          /@Api(?:Response|OkResponse|CreatedResponse|NoContentResponse)\s*\(/g,
        ) ?? []
      ).length;
      if (responseCount < expected.length) {
        problems.push(
          `${entity.name} controller must document a success response for every route`,
        );
      }
      const expectsUuidParam = expected.some((endpoint) => {
        const pathParams = Array.from(
          endpoint.path.matchAll(/:([A-Za-z0-9_]+)/g),
          (match) => match[1],
        );
        return pathParams.some((param) => {
          const field = endpoint.requestFields?.find(
            (candidate) => candidate.name === param,
          );
          return (
            String(field?.type ?? '')
              .toLowerCase()
              .includes('uuid') ||
            param === 'id' ||
            param.endsWith('Id')
          );
        });
      });
      if (expectsUuidParam && !/ParseUUIDPipe/.test(controller)) {
        problems.push(
          `${entity.name} controller must validate UUID route parameters with ParseUUIDPipe`,
        );
      }
      problems.push(...this.validateDtoSkeleton(entity, params.files));
    }

    if (params.task.kind === 'entity-relations') {
      for (const file of params.files.filter((candidate) =>
        candidate.path.endsWith('.entity.ts'),
      )) {
        const owningRelations = (
          file.content.match(/@(ManyToOne|OneToOne)\s*\(/g) ?? []
        ).length;
        const deletePolicies = (file.content.match(/\bonDelete\s*:/g) ?? [])
          .length;
        if (deletePolicies < owningRelations) {
          problems.push(
            `${file.path} must declare an explicit onDelete policy for every owning relation`,
          );
        }
      }
    }

    for (const file of params.files) {
      if (/\bTODO\b|not implemented|placeholder/i.test(file.content)) {
        problems.push(`${file.path} contains placeholder implementation`);
      }
    }
    return problems;
  }

  validateApplicationFiles(params: {
    spec: AppSpec;
    files: GeneratedFile[];
  }): string[] {
    const problems: string[] = [];
    for (const entity of params.spec.entities) {
      const slug = this.toKebabCase(entity.name);
      const entityPath = `src/${slug}/${slug}.entity.ts`;
      const entityFile = params.files.find((file) => file.path === entityPath);
      if (!entityFile) {
        problems.push(`${entityPath}: required entity file is missing`);
      } else {
        problems.push(
          ...this.validateTaskFiles({
            spec: params.spec,
            task: this.entityFieldsTask(entity),
            files: [entityFile],
          }).map((problem) => `${entityPath}: ${problem}`),
        );
      }

      if (entity.endpoints.length > 0) {
        const controllerPath = `src/${slug}/${slug}.controller.ts`;
        const controller = params.files.find(
          (file) => file.path === controllerPath,
        );
        if (!controller) {
          problems.push(`${controllerPath}: endpoint controller is missing`);
        } else {
          problems.push(
            ...this.validateEndpointSkeleton(entity, controller.content).map(
              (problem) => `${controllerPath}: ${problem}`,
            ),
          );
        }
        problems.push(...this.validateDtoSkeleton(entity, params.files));
      }
    }
    const appModule =
      params.files.find((file) => file.path === 'src/app.module.ts')?.content ??
      '';
    const main =
      params.files.find((file) => file.path === 'src/main.ts')?.content ?? '';
    const nestCli =
      params.files.find((file) => file.path === 'nest-cli.json')?.content ?? '';
    const productionDatabase = this.productionDatabaseType(params.spec);
    if (
      !appModule.includes('DATABASE_URL') ||
      !appModule.includes(`type: '${productionDatabase}'`) ||
      !appModule.includes("type: 'sqljs'")
    ) {
      problems.push(
        `src/app.module.ts: must provide ${productionDatabase} DATABASE_URL config with SQL.js smoke fallback`,
      );
    }
    if (!main.includes('forbidNonWhitelisted: true')) {
      problems.push(
        'src/main.ts: ValidationPipe must reject unknown request properties',
      );
    }
    if (
      !nestCli.includes('@nestjs/swagger') ||
      !nestCli.includes('classValidatorShim')
    ) {
      problems.push(
        'nest-cli.json: Nest Swagger plugin with classValidatorShim is required',
      );
    }
    const expectedGlobalRoutes = new Set([
      'GET /health',
      ...[
        ...params.spec.endpoints,
        ...params.spec.entities.flatMap((entity) => entity.endpoints),
      ]
        .filter(
          (endpoint): endpoint is EndpointSpec =>
            typeof endpoint.method === 'string' &&
            typeof endpoint.path === 'string',
        )
        .map(
          (endpoint) =>
            `${endpoint.method.toUpperCase()} ${this.normalizeEndpointPath(endpoint.path)}`,
        ),
    ]);
    for (const controller of params.files.filter((file) =>
      file.path.endsWith('.controller.ts'),
    )) {
      for (const route of this.controllerRoutes(controller.content)) {
        if (!expectedGlobalRoutes.has(route)) {
          problems.push(
            `${controller.path}: exposes API absent from the global endpoint skeleton: ${route}`,
          );
        }
      }
    }
    const actualGlobalRoutes = new Set(
      params.files
        .filter((file) => file.path.endsWith('.controller.ts'))
        .flatMap((file) => [...this.controllerRoutes(file.content)]),
    );
    for (const route of expectedGlobalRoutes) {
      if (!actualGlobalRoutes.has(route)) {
        problems.push(
          `global endpoint skeleton is missing from generated controllers: ${route}`,
        );
      }
    }
    for (const file of params.files) {
      if (/\bTODO\b|not implemented|placeholder/i.test(file.content)) {
        problems.push(`${file.path}: contains placeholder implementation`);
      }
    }
    return [...new Set(problems)];
  }

  taskGenerationPrompt(params: {
    spec: AppSpec;
    task: BuildTask;
    context: CodeContext;
  }): string {
    return [
      'Execute exactly one planned NestJS backend task.',
      'Return JSON shape: {"files":[{"path":"relative/path","content":"complete file content"}]}.',
      'Return complete replacement content for changed files, not snippets.',
      'You must only create or modify files listed in currentTask.allowedFiles.',
      'If currentTask.allowedFiles does not include a file, do not return that file.',
      'Do not jump ahead to unrelated tasks.',
      'Use Skeleton-of-Thought: first read the authoritative endpoint skeleton in currentTask.description, then expand only those routes into code.',
      'The endpoint skeleton is the API source of truth. Never add a public controller route that is absent from it, even if generic CRUD would normally include it.',
      'Use NestJS 10, TypeScript 5, TypeORM 0.3, and @nestjs/typeorm 10.',
      'Never add new packages to package.json or change dependency versions; generated code must only import packages already declared in the bootstrap package.json.',
      'Do not use @nestjs/swagger decorators unless @nestjs/swagger is already declared in package.json.',
      'With TypeORM 0.3 repositories, never call repository.findOne(id); use repository.findOne({ where: { id } }) or findOneBy({ id }).',
      'Service methods that look up a single entity by id (findOne, update, remove) must throw NotFoundException from @nestjs/common when the entity does not exist — never return null to the controller.',
      'Use definite assignment assertions for entity and DTO properties where needed, for example "id!: string".',
      'Preserve ERD nullability exactly: fields marked required/NN must use non-optional properties and must never emit nullable: true; create DTOs must validate those fields as required.',
      'Use @CreateDateColumn for createdAt and @UpdateDateColumn for updatedAt so timestamps are server-managed. Do not accept primary keys, createdAt, or updatedAt in create/update DTOs unless the endpoint specification explicitly requires client ownership.',
      'Use @nestjs/swagger PartialType for update DTOs and add @ApiProperty/@ApiPropertyOptional where needed so every request and response field appears in OpenAPI.',
      'Every controller must declare @ApiTags and every route must declare @ApiOperation plus explicit success and relevant 400/404/409 response decorators.',
      'Validate UUID route parameters with ParseUUIDPipe. Use class-validator constraints that match the field type and documented business rules, including non-empty, enum, numeric range, and length constraints when specified.',
      'Enforce invariants twice when appropriate: class-validator for request feedback and TypeORM unique/check/foreign-key constraints for persisted integrity.',
      'Before saving a relation foreign key, query the related repository and throw NotFoundException when it does not exist; never expose a raw foreign-key violation as HTTP 500.',
      'Convert expected uniqueness or relation conflicts into ConflictException or BadRequestException with a stable message instead of returning a generic 500.',
      'Declare an explicit onDelete policy for every TypeORM relation, choosing RESTRICT by default unless the specification explicitly requires CASCADE or SET NULL.',
      'Keep code buildable with npm run build.',
      'Never import a type, enum, or class from another generated file unless the code context explicitly shows that file exports it.',
      'When a DTO needs an enum-like field whose enum lives in an entity file you cannot verify, declare the property as string (optionally a local string union) instead of importing from the entity.',
      'When creating an entity from a DTO, call repository.create({ ...dto }) with an object-literal spread so TypeScript selects the single-entity overload.',
      'Keep each DTO property type identical to the entity property it maps to (string stays string, Date stays Date); when they must differ, convert explicitly in the service before create/save.',
      'For temporal entity fields, prefer a Date property with driver-inferred @Column() metadata. Never hard-code timestamp or datetime because the production driver and SQL.js fallback support different explicit type names.',
      'Keep TypeOrmModule.forRoot configured with retryAttempts: 1 so smoke-check metadata failures fail fast.',
      'If a previous failure shows TS2769 "No overload matches this call" on repository.create, do not pass the DTO directly; write const entity = this.repository.create(); then assign each property explicitly and save the entity.',
      'When currentTask.kind is "entity-relations", relation inverse-side lambdas must reference properties that actually exist on the related class.',
      'When currentTask.kind is "entity-relations", update both sides of every relationship in the current task relation skeleton only; do not process relations assigned to other map shards.',
      'When currentTask.kind is "entity-relations", return EVERY file listed in currentTask.allowedFiles in one response, each with complete final content; never return only a subset of the entity files.',
      'When currentTask.kind is "entity-relations", every property referenced by an inverse-side lambda (e.g. x => x.user) must be declared in the returned content of that related entity file with the matching @ManyToOne/@OneToMany decorator.',
      'When a previous TypeScript error says Property "x" does not exist on type "Y", either change the inverse-side lambda to an existing property or add property "x" to class Y if Y is in currentTask.allowedFiles.',
      'When currentTask.kind is "business-workflow", implement only workflows that are explicitly supported by the normalized spec and existing entity files.',
      'When currentTask.kind is "business-workflow", create or update only the dedicated business-workflows module/controller/service/DTO files and AppModule registration.',
      'When currentTask.kind is "business-workflow", do not edit or replace existing entity CRUD services/controllers; preserve all generated CRUD features.',
      'When currentTask.kind is "business-workflow", never import or reference an entity that is not present in the normalized spec and generated source tree.',
      'When currentTask.kind is "endpoint-workflow", implement every endpoint listed in currentTask.description and currentTask.doneCriteria, including its implementationRequirements from the normalized spec.',
      'When currentTask.kind is "endpoint-workflow", update the existing feature controller/service/DTO files in currentTask.allowedFiles; preserve existing CRUD methods while adding or completing non-CRUD endpoint behavior.',
      'When currentTask.kind is "endpoint-workflow", do not leave TODO, placeholder, stub, pseudo-code, empty method bodies, or comments that stand in for required behavior.',
      'When currentTask.kind is "endpoint-workflow", if the spec does not provide a threshold, recipient, or rule detail, choose a conservative deterministic default from the available entity fields and document it in executable code, not as an unimplemented comment.',
      'Business workflow methods that update multiple tables must use TypeORM DataSource.transaction or an equivalent transaction manager.',
      'For stock workflows, InventoryBalance quantityOnHand and quantityReserved are the source of truth; reject insufficient or negative stock with BadRequestException.',
      'For sales shipping, create outbound StockMovement rows, update SalesOrder status, and create an Invoice in the same transaction.',
      'For purchase receiving, create inbound StockMovement rows, update InventoryBalance, and update PurchaseOrder status in the same transaction.',
      'For payments, create Payment and update Invoice.amountPaid/status in the same transaction.',
      'For workflow endpoints with route params like :id, service methods must accept the route id as a separate string parameter and must not read dto.id unless the DTO explicitly declares it.',
      'For workflow services, import every entity class passed to manager.find, manager.findOne, manager.create, or manager.save so TypeScript can infer entity property types.',
      'For workflow DTOs, declare every property the service reads, such as payment method/reference/paidAt when recording payments.',
      'For workflow services, after manager.findOne calls, check for null and throw before reading or saving the entity so strict null checks pass.',
      'For one-to-one relationships, use singular inverse properties such as "invoice" instead of plural names unless the related class declares the plural property.',
      'If codeContext.previousFailures contains TypeScript errors, fix those exact errors first and preserve already working files.',
      'Any // <semraz:user-code ...> ... // </semraz:user-code> block is user-owned: reproduce it byte-for-byte in the returned complete file and never move, edit, or remove it.',
      'codeContext.fileContents holds the CURRENT content of existing generated files; treat it as the source of truth for what already exists, and when modifying one of those files start from that content instead of rewriting it from scratch.',
      '',
      'Current task:',
      JSON.stringify(params.task, null, 2),
      '',
      'Task-scoped application spec (Map-Reduce projection):',
      JSON.stringify(this.taskSpecView(params.spec, params.task), null, 2),
      '',
      'Code context:',
      JSON.stringify(params.context, null, 2),
    ].join('\n');
  }

  entityDesignPrompt(params: {
    spec: AppSpec;
    existingFiles: GeneratedFile[];
  }): string {
    return [
      'Design all TypeORM entity classes for this NestJS backend before feature implementation starts.',
      'Return JSON shape: {"files":[{"path":"relative/path","content":"complete file content"}]}.',
      'Return complete replacement content for changed files, not snippets.',
      'Generate every entity class in the spec in this single step, so relations can import existing files.',
      'Use TypeORM decorators from "typeorm".',
      'Use definite assignment assertions for entity properties, for example "id!: string".',
      'Use SQL.js TypeORM config in src/app.module.ts via TypeOrmModule.forRoot with type "sqljs", synchronize true, and all generated entities registered.',
      'Do not create controllers, services, DTOs, or feature modules in this entity design step.',
      'Keep the app buildable with npm run build.',
      '',
      'Application spec:',
      JSON.stringify(params.spec, null, 2),
      '',
      'Existing files:',
      JSON.stringify(params.existingFiles, null, 2),
    ].join('\n');
  }

  entityContextHints(entity: EntitySpec): string[] {
    const name = entity.name;
    return [
      `${name.toLowerCase()}`,
      `${this.toKebabCase(name)}`,
      `${this.toPascalCase(name)}Module`,
      `${this.toPascalCase(name)}Controller`,
      `${this.toPascalCase(name)}Service`,
      'AppModule',
      '@Module',
      '@Controller',
      '@Injectable',
    ];
  }

  private entityFieldsTask(entity: EntitySpec): BuildTask {
    const slug = this.toKebabCase(entity.name);
    return {
      id: `entity-${slug}-fields`,
      kind: 'entity-fields',
      title: `Create ${entity.name} TypeORM entity fields`,
      description:
        `Create only the ${entity.name} TypeORM entity class with scalar columns. ` +
        'Do not add relation decorators in this task.',
      targetEntity: entity.name,
      dependsOn: [],
      allowedFiles: [`src/${slug}/${slug}.entity.ts`],
      doneCriteria: [
        `${entity.name} entity class exists`,
        'Scalar fields from the spec are represented as TypeORM columns',
        'Primary keys and createdAt/updatedAt fields are server-managed',
        'Database constraints preserve documented uniqueness, ranges, and nullability',
        'No imports from not-yet-created related entity files are required',
        'Configured build command passes',
      ],
    };
  }

  private entityRelationsTask(
    relations: RelationSkeleton[],
    entityFieldTaskIds: string[],
    id: string,
    batchNumber: number,
    batchCount: number,
  ): BuildTask {
    const entityNames = new Set(
      relations.flatMap((relation) => [relation.source, relation.target]),
    );
    return {
      id,
      kind: 'entity-relations',
      title: `Map relation skeleton ${batchNumber}/${batchCount}`,
      description: [
        `Apply only relation skeleton batch ${batchNumber}/${batchCount}.`,
        'Do not infer additional relationships.',
        JSON.stringify(relations, null, 2),
      ].join('\n'),
      dependsOn: entityFieldTaskIds.filter((taskId) =>
        [...entityNames].some(
          (name) => taskId === `entity-${this.toKebabCase(name)}-fields`,
        ),
      ),
      allowedFiles: [...entityNames].map((name) => {
        const slug = this.toKebabCase(name);
        return `src/${slug}/${slug}.entity.ts`;
      }),
      doneCriteria: [
        'Relation decorators match the normalized spec',
        'Every relation declares an explicit onDelete policy',
        'Related entity imports point to existing generated entity files',
        'Configured build command passes',
      ],
    };
  }

  private ormRegistrationTask(
    spec: AppSpec,
    relationTaskIds: string[],
  ): BuildTask {
    const entities = spec.entities;
    const productionDatabase = this.productionDatabaseType(spec);
    const entityFieldTaskIds = entities.map(
      (entity) => `entity-${this.toKebabCase(entity.name)}-fields`,
    );
    return {
      id: 'orm-registration',
      kind: 'orm-registration',
      title: 'Register TypeORM infrastructure',
      description: `Reduce all relation map outputs, configure ${productionDatabase} through DATABASE_URL with a SQL.js local smoke fallback, and register all generated entities.`,
      // Relation map tasks depend only on the entity files touched by that
      // shard. ORM registration, however, registers the whole application and
      // must wait for every scalar entity task as well as every relation map.
      dependsOn: [...entityFieldTaskIds, ...relationTaskIds],
      allowedFiles: ['src/app.module.ts', 'package.json', 'tsconfig.json'],
      doneCriteria: [
        `${productionDatabase} DATABASE_URL is the production database and SQL.js is the local smoke fallback`,
        'All generated entity classes are registered',
        'Required TypeORM dependencies are present in package.json',
        'Configured build command passes',
      ],
    };
  }

  private crudFeatureTask(
    entity: EntitySpec,
    entities: EntitySpec[],
  ): BuildTask {
    const slug = this.toKebabCase(entity.name);
    return {
      id: `feature-${slug}-crud`,
      kind: 'crud-feature',
      title: `Implement ${entity.name} CRUD feature`,
      description: [
        `Implement the ${entity.name} NestJS module, controller, service, DTOs, and repository usage.`,
        'Authoritative endpoint skeleton (expand exactly these routes; no extras):',
        JSON.stringify(this.conventionalEndpointSkeleton(entity), null, 2),
      ].join('\n'),
      targetEntity: entity.name,
      dependsOn: ['orm-registration'],
      allowedFiles: [
        `src/${slug}/${slug}.module.ts`,
        `src/${slug}/${slug}.controller.ts`,
        `src/${slug}/${slug}.service.ts`,
        `src/${slug}/dto/create-${slug}.dto.ts`,
        `src/${slug}/dto/update-${slug}.dto.ts`,
        'src/app.module.ts',
      ],
      doneCriteria: [
        'Feature module is registered in AppModule',
        'Controller exposes endpoints from the spec',
        'Service uses TypeORM repository for persistence',
        'DTOs use class-validator decorators',
        'Swagger documents request fields, response models, operations, and error statuses',
        'Route UUIDs, relation existence, and documented invariants return controlled 4xx errors',
        'Configured build command passes',
      ],
    };
  }

  private endpointWorkflowTask(
    entity: EntitySpec,
    _entities: EntitySpec[],
    endpoints: EndpointSpec[],
  ): BuildTask {
    const slug = this.toKebabCase(entity.name);
    const endpointLines = endpoints.map((endpoint) => {
      const requirements = this.endpointImplementationRequirements(endpoint);
      return [
        `${endpoint.method} ${endpoint.path}`,
        endpoint.operationName ? `operation=${endpoint.operationName}` : '',
        endpoint.description ? `description=${endpoint.description}` : '',
        requirements ? `implementationRequirements=${requirements}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
    });

    return {
      id: `endpoint-${slug}-workflows`,
      kind: 'endpoint-workflow',
      title: `Implement ${entity.name} non-CRUD endpoints`,
      description: [
        `Complete the ${entity.name} endpoints that require domain behavior beyond generic CRUD.`,
        'Authoritative endpoint skeleton (the final controller must expose exactly this set):',
        JSON.stringify(this.endpointSkeleton(entity), null, 2),
        'Non-CRUD operations requiring domain implementation:',
        ...endpointLines.map((line) => `- ${line}`),
      ].join('\n'),
      targetEntity: entity.name,
      dependsOn: [`feature-${slug}-crud`],
      allowedFiles: [
        `src/${slug}/${slug}.module.ts`,
        `src/${slug}/${slug}.controller.ts`,
        `src/${slug}/${slug}.service.ts`,
        `src/${slug}/dto/create-${slug}.dto.ts`,
        `src/${slug}/dto/update-${slug}.dto.ts`,
        'src/app.module.ts',
      ],
      doneCriteria: [
        'Every non-CRUD endpoint from the normalized spec is exposed with the exact method and route path',
        'Each endpoint has executable service logic that satisfies its implementationRequirements and description',
        'No TODO, placeholder, stub, pseudo-code, or empty method body remains in changed endpoint workflow code',
        'Existing CRUD endpoints and service methods continue to compile and behave as before',
        'Configured build command passes',
      ],
    };
  }

  private businessWorkflowTask(
    entities: EntitySpec[],
    relationTaskIds: string[],
  ): BuildTask {
    const featureTaskIds = entities.map(
      (entity) => `feature-${this.toKebabCase(entity.name)}-crud`,
    );

    return {
      id: 'business-transaction-workflows',
      kind: 'business-workflow',
      title: 'Implement cross-entity transactional business workflows',
      description:
        'Implement business endpoints that update multiple entities atomically, especially stock reservation, stock deduction, stock movement audit rows, invoice creation, and payment-to-invoice consistency.',
      dependsOn: ['orm-registration', ...relationTaskIds, ...featureTaskIds],
      allowedFiles: [
        'src/app.module.ts',
        'src/business-workflows/business-workflows.module.ts',
        'src/business-workflows/business-workflows.controller.ts',
        'src/business-workflows/business-workflows.service.ts',
        'src/business-workflows/dto/receive-purchase-order.dto.ts',
        'src/business-workflows/dto/confirm-sales-order.dto.ts',
        'src/business-workflows/dto/ship-sales-order.dto.ts',
        'src/business-workflows/dto/record-payment.dto.ts',
      ],
      doneCriteria: [
        'Purchase order receive updates PurchaseOrder, PurchaseOrderLine, InventoryBalance, and StockMovement atomically',
        'Sales order confirm reserves InventoryBalance stock atomically and rejects insufficient stock',
        'Sales order ship deducts InventoryBalance stock, creates outbound StockMovement rows, creates Invoice, and updates SalesOrder atomically',
        'Payment creation updates Invoice.amountPaid and Invoice.status atomically',
        'No workflow can partially commit when validation fails',
        'Configured build command passes',
      ],
    };
  }

  private nonCrudEndpoints(entity: EntitySpec): EndpointSpec[] {
    return entity.endpoints
      .filter((endpoint): endpoint is EndpointSpec => {
        return (
          typeof endpoint.method === 'string' &&
          typeof endpoint.path === 'string'
        );
      })
      .filter((endpoint) => !this.isConventionalCrudEndpoint(entity, endpoint));
  }

  private isConventionalCrudEndpoint(
    entity: EntitySpec,
    endpoint: EndpointSpec,
  ): boolean {
    const method = endpoint.method.toUpperCase();
    const normalizedPath = this.normalizeEndpointPath(endpoint.path);
    const collectionPaths = this.collectionPathCandidates(entity);
    const idPathPattern = /\{?:(?:id|uuid)\}?|\{(?:id|uuid)\}/i;

    for (const collectionPath of collectionPaths) {
      if (normalizedPath === collectionPath) {
        return method === 'GET' || method === 'POST';
      }

      const suffix = normalizedPath.slice(collectionPath.length);
      if (
        suffix.startsWith('/') &&
        idPathPattern.test(suffix.slice(1)) &&
        !suffix.slice(1).includes('/')
      ) {
        return ['GET', 'PATCH', 'PUT', 'DELETE'].includes(method);
      }
    }

    return false;
  }

  private collectionPathCandidates(entity: EntitySpec): string[] {
    const slug = this.toKebabCase(entity.name);
    const plural = this.toKebabCase(this.pluralizeLabel(entity.name));
    return [
      ...new Set([`/${slug}`, `/api/${slug}`, `/${plural}`, `/api/${plural}`]),
    ];
  }

  private normalizeEndpointPath(path: string): string {
    const normalized = path
      .trim()
      .replace(/\{([^}]+)\}/g, ':$1')
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/, '')
      .replace(/^([^/])/, '/$1');
    return normalized || '/';
  }

  private productionDatabaseType(spec: AppSpec): 'postgres' | 'mysql' {
    const declared = JSON.stringify(spec.database ?? {}).toLowerCase();
    return /mysql|mariadb/.test(declared) ? 'mysql' : 'postgres';
  }

  private normalizePortableColumnTypes(content: string) {
    return content
      .replace(/\btype:\s*['"](?:timestamp|datetime)['"]\s*,?\s*/g, '')
      .replace(/,\s*}/g, ' }')
      .replace(/@Column\(\{\s*}\)/g, '@Column()');
  }

  private endpointSkeleton(entity: EntitySpec): EndpointSpec[] {
    return entity.endpoints.filter(
      (endpoint): endpoint is EndpointSpec =>
        typeof endpoint.method === 'string' &&
        typeof endpoint.path === 'string',
    );
  }

  private conventionalEndpointSkeleton(entity: EntitySpec): EndpointSpec[] {
    return this.endpointSkeleton(entity).filter((endpoint) =>
      this.isConventionalCrudEndpoint(entity, endpoint),
    );
  }

  private controllerRoutes(controller: string, base?: string): Set<string> {
    const controllerBase =
      base ??
      controller.match(/@Controller\(\s*['"]([^'"]*)['"]\s*\)/)?.[1] ??
      '';
    return new Set(
      Array.from(
        controller.matchAll(
          /@(Get|Post|Put|Patch|Delete|Head|Options|All)(?:\(\s*(?:['"]([^'"]*)['"])?\s*\))?/g,
        ),
        (match) =>
          `${match[1].toUpperCase()} ${this.normalizeEndpointPath(
            `/${controllerBase}/${match[2] ?? ''}`,
          )}`,
      ),
    );
  }

  private validateEndpointSkeleton(
    entity: EntitySpec,
    controller: string,
  ): string[] {
    const actual = this.controllerRoutes(controller);
    const expected = new Set(
      this.endpointSkeleton(entity).map(
        (endpoint) =>
          `${endpoint.method.toUpperCase()} ${this.normalizeEndpointPath(endpoint.path)}`,
      ),
    );
    return [
      ...[...expected]
        .filter((route) => !actual.has(route))
        .map((route) => `${entity.name} controller is missing ${route}`),
      ...[...actual]
        .filter((route) => !expected.has(route))
        .map(
          (route) =>
            `${entity.name} controller exposes API absent from specification: ${route}`,
        ),
    ];
  }

  private validateDtoSkeleton(
    entity: EntitySpec,
    files: GeneratedFile[],
  ): string[] {
    const slug = this.toKebabCase(entity.name);
    const dtoFiles = files.filter((file) =>
      file.path.startsWith(`src/${slug}/dto/`),
    );
    const dtoSource = dtoFiles.map((file) => file.content).join('\n');
    const requestFields = this.endpointSkeleton(entity).flatMap((endpoint) =>
      (Array.isArray(endpoint.requestFields)
        ? endpoint.requestFields
        : []
      ).filter((field) => {
        const name = typeof field.name === 'string' ? field.name : '';
        return (
          Boolean(name) &&
          !new RegExp(`(?:\\{|:)${this.escapeRegExp(name)}(?:\\}|/|$)`).test(
            endpoint.path,
          )
        );
      }),
    );
    const problems: string[] = [];
    for (const field of requestFields) {
      const name = typeof field.name === 'string' ? field.name : '';
      if (!name) continue;
      const property = dtoSource.match(
        new RegExp(`\\b${this.escapeRegExp(name)}([!?]?):\\s*`, 'm'),
      );
      if (!property) {
        problems.push(
          `src/${slug}/dto: request field ${name} is absent from generated DTOs`,
        );
      } else if (field.required === true && property[1] === '?') {
        problems.push(
          `src/${slug}/dto: required request field ${name} is optional`,
        );
      }
      const propertyWithDecorators = dtoSource.match(
        new RegExp(
          `((?:\\s*@(?:Is|Min|Max|Length|Matches)[^\\n]*\\n)+\\s*${this.escapeRegExp(name)}[!?]?:)`,
          'm',
        ),
      );
      if (!propertyWithDecorators) {
        problems.push(
          `src/${slug}/dto: request field ${name} needs class-validator constraints`,
        );
      }
    }
    const updateDto = dtoFiles.find((file) =>
      file.path.endsWith(`update-${slug}.dto.ts`),
    )?.content;
    if (
      updateDto &&
      updateDto.includes('PartialType') &&
      !updateDto.includes("from '@nestjs/swagger'")
    ) {
      problems.push(
        `src/${slug}/dto: update DTO must import PartialType from @nestjs/swagger`,
      );
    }
    return problems;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private relationSkeleton(entities: EntitySpec[]): RelationSkeleton[] {
    const names = entities.map((entity) => entity.name);
    const ranked = new Map<string, RelationSkeleton>();
    for (const entity of entities) {
      for (const declaration of entity.relations) {
        const serialized = JSON.stringify(declaration).toLowerCase();
        const explicit = ['target', 'to', 'entity', 'relatedEntity']
          .map((key) => declaration[key])
          .find((value): value is string => typeof value === 'string');
        const target =
          names.find(
            (name) =>
              this.normalizeName(name) === this.normalizeName(explicit ?? ''),
          ) ??
          names.find(
            (name) =>
              name !== entity.name &&
              serialized.includes(this.normalizeName(name)),
          );
        if (!target) continue;
        const pairKey = [entity.name, target]
          .map((name) => this.normalizeName(name))
          .sort()
          .join('::');
        const identity = this.relationIdentity(declaration);
        const key = identity ? `${pairKey}::${identity}` : pairKey;
        const candidate = { source: entity.name, target, declaration };
        const existing = ranked.get(key);
        if (
          !existing ||
          this.relationRank(declaration) >
            this.relationRank(existing.declaration)
        ) {
          ranked.set(key, candidate);
        }
      }
    }
    return [...ranked.values()].sort((left, right) =>
      `${left.source}:${left.target}`.localeCompare(
        `${right.source}:${right.target}`,
      ),
    );
  }

  private relationRank(relation: Record<string, unknown>): number {
    const value = JSON.stringify(relation).toLowerCase();
    if (/1\s*[:\-]\s*n|one.?to.?many|many.?to.?one/.test(value)) return 3;
    if (/n\s*[:\-]\s*n|many.?to.?many/.test(value)) return 2;
    return 1;
  }

  private relationIdentity(relation: Record<string, unknown>): string {
    const explicitId = [
      relation.relationId,
      relation.id,
      relation.name,
      relation.relationName,
    ].find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    if (explicitId) return this.normalizeName(explicitId);

    const properties = [
      relation.property,
      relation.sourceProperty,
      relation.targetProperty,
      relation.inverseProperty,
      relation.foreignKey,
    ]
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      )
      .map((value) => this.normalizeName(value))
      .sort();
    return properties.join('::');
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private taskSpecView(spec: AppSpec, task: BuildTask) {
    const allowedEntitySlugs = new Set(
      task.allowedFiles
        .filter((file) => file.endsWith('.entity.ts'))
        .map((file) => file.split('/')[1]),
    );
    const entities = spec.entities.filter(
      (entity) =>
        entity.name === task.targetEntity ||
        allowedEntitySlugs.has(this.toKebabCase(entity.name)),
    );
    return {
      projectName: spec.projectName,
      summary: spec.summary,
      entities:
        task.kind === 'orm-registration'
          ? spec.entities.map((entity) => ({ name: entity.name }))
          : entities.length > 0
            ? entities
            : spec.entities,
      endpoints: task.targetEntity
        ? spec.endpoints.filter((endpoint) =>
            entities.some((entity) => entity.endpoints.includes(endpoint)),
          )
        : [],
      auth: spec.auth,
      database: spec.database,
      businessRules:
        task.kind === 'business-workflow' ? spec.businessRules : [],
      assumptions: spec.assumptions,
    };
  }

  private endpointImplementationRequirements(endpoint: EndpointSpec): string {
    const value = (endpoint as Record<string, unknown>)
      .implementationRequirements;
    if (typeof value === 'string') {
      return value.trim();
    }
    if (Array.isArray(value)) {
      return value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .join('; ');
    }
    return '';
  }

  private relatedEntityFiles(
    entity: EntitySpec,
    entities: EntitySpec[],
  ): string[] {
    const files = new Set<string>();

    for (const candidate of entities) {
      if (candidate.name === entity.name) {
        continue;
      }

      const slug = this.toKebabCase(candidate.name);
      files.add(`src/${slug}/${slug}.module.ts`);
      files.add(`src/${slug}/${slug}.service.ts`);
      files.add(`src/${slug}/${slug}.entity.ts`);
      files.add(`src/${slug}/dto/create-${slug}.dto.ts`);
      files.add(`src/${slug}/dto/update-${slug}.dto.ts`);
    }

    return [...files];
  }

  private hasBusinessWorkflowRequirements(spec: AppSpec) {
    const entityNames = new Set(
      spec.entities.map((entity) => this.normalizeName(entity.name)),
    );
    const hasSupportedInventoryWorkflowSchema = [
      'InventoryBalance',
      'Invoice',
      'Payment',
      'PurchaseOrder',
      'PurchaseOrderLine',
      'SalesOrder',
      'SalesOrderLine',
      'StockMovement',
    ].every((entityName) => entityNames.has(this.normalizeName(entityName)));

    if (!hasSupportedInventoryWorkflowSchema) {
      return false;
    }

    const searchable = JSON.stringify({
      endpoints: spec.endpoints,
      businessRules: spec.businessRules,
      entityRules: spec.entities.map((entity) => entity.businessRules),
    }).toLowerCase();

    return [
      'transaction',
      'atomically',
      'atomic',
      'inventorybalance',
      'quantityonhand',
      'quantityreserved',
      'stock',
      'reserve',
      'ship',
      'receive',
      'invoice',
      'movement',
    ].some((keyword) => searchable.includes(keyword));
  }

  normalizeGeneratedFiles(files: GeneratedFile[]): GeneratedFile[] {
    return files.map((file) => {
      if (file.path === 'package.json') {
        return {
          ...file,
          content: this.normalizePackageJson(file.content),
        };
      }

      if (file.path === 'tsconfig.json') {
        return {
          ...file,
          content: this.normalizeTsConfig(file.content),
        };
      }

      if (file.path.endsWith('.entity.ts')) {
        return {
          ...file,
          content: this.normalizeCommonTypescriptSyntax(
            this.normalizePortableColumnTypes(file.content),
          ),
        };
      }

      if (file.path.endsWith('.ts')) {
        return {
          ...file,
          content: this.normalizeCommonTypescriptSyntax(file.content),
        };
      }

      return file;
    });
  }

  mergeGeneratedFile(params: {
    rootDir: string;
    file: GeneratedFile;
    existingContent?: string;
  }): GeneratedFile {
    if (params.file.path !== 'src/app.module.ts' || !params.existingContent) {
      return params.file;
    }

    return {
      ...params.file,
      content: this.mergeNestAppModule(
        params.existingContent,
        params.file.content,
      ),
    };
  }

  async postProcessAppliedFiles(params: {
    rootDir: string;
    changedFiles: string[];
    workspace: WorkspaceWriter;
  }): Promise<string[]> {
    if (!params.changedFiles.some((file) => file.endsWith('.entity.ts'))) {
      return [];
    }

    const entityFiles = (
      await params.workspace.listFiles(params.rootDir)
    ).filter((file) => file.endsWith('.entity.ts') && file.startsWith('src/'));
    const entities = await Promise.all(
      entityFiles.map(async (filePath) => {
        const absolutePath = params.workspace.resolveInside(
          params.rootDir,
          filePath,
        );
        const content = await params.workspace.readTextFile(absolutePath);
        return this.parseEntityFile(filePath, content);
      }),
    );
    const byClassName = new Map(
      entities.map((entity) => [entity.className, entity]),
    );
    const changed = new Map<string, string>();

    for (const entity of entities) {
      const content = this.ensureUsedTypeOrmDecoratorImports(entity.content);
      if (content !== entity.content) {
        entity.content = content;
        changed.set(entity.filePath, entity.content);
      }
    }

    for (const entity of entities) {
      for (const relation of this.parseOwningRelations(entity.content)) {
        const target = byClassName.get(relation.targetClass);
        if (!target) {
          continue;
        }

        if (target.properties.has(relation.inverseProperty)) {
          // A collection inverse cannot be paired with @OneToOne. Normalize the
          // owning side to @ManyToOne so both decorators express the same
          // cardinality and runtime metadata agrees with the property types.
          if (
            relation.decorator === 'OneToOne' &&
            target.arrayProperties.has(relation.inverseProperty)
          ) {
            entity.content = this.ensureTypeOrmDecoratorImport(
              entity.content.replace(
                relation.raw,
                relation.raw.replace('@OneToOne', '@ManyToOne'),
              ),
              'ManyToOne',
            );
            changed.set(entity.filePath, entity.content);
          }
          continue;
        }

        const existingInverse = target.propertyTypes.get(entity.className);
        if (existingInverse) {
          entity.content = entity.content.replace(
            relation.raw,
            relation.raw.replace(
              `.${relation.inverseProperty}`,
              `.${existingInverse}`,
            ),
          );
          changed.set(entity.filePath, entity.content);
          continue;
        }

        if (relation.decorator === 'ManyToOne') {
          target.content = this.ensureTypeOrmDecoratorImport(
            target.content,
            'OneToMany',
          );
          target.content = this.ensureEntityImport(
            target.content,
            entity.className,
            target.filePath,
            entity.filePath,
          );
          target.content = this.insertClassProperty(
            target.content,
            [
              `  @OneToMany(() => ${entity.className}, ${relation.sourceVariable} => ${relation.sourceVariable}.${relation.sourceProperty})`,
              `  ${relation.inverseProperty}!: ${entity.className}[];`,
            ].join('\n'),
          );
          target.properties.add(relation.inverseProperty);
          target.propertyTypes.set(entity.className, relation.inverseProperty);
          changed.set(target.filePath, target.content);
        }
      }
    }

    // Symmetric pass: a @OneToMany inverse lambda (x => x.user) is dangling
    // unless the target entity declares the owning @ManyToOne side. The LLM
    // often emits the collection side but forgets the owning side, producing
    // "Property 'user' does not exist on type 'HealthMetric'".
    for (const entity of entities) {
      for (const relation of this.parseInverseRelations(entity.content)) {
        const target = byClassName.get(relation.targetClass);
        if (!target || target.properties.has(relation.inverseProperty)) {
          continue;
        }

        // Target already owns a relation back to this entity under a different
        // property name → repoint the @OneToMany lambda at the existing one.
        const existingOwning = target.propertyTypes.get(entity.className);
        if (existingOwning) {
          entity.content = entity.content.replace(
            relation.raw,
            relation.raw.replace(
              `.${relation.inverseProperty}`,
              `.${existingOwning}`,
            ),
          );
          changed.set(entity.filePath, entity.content);
          continue;
        }

        // Otherwise synthesize the missing owning @ManyToOne side.
        const ownerVariable = this.toCamelCase(entity.className);
        target.content = this.ensureTypeOrmDecoratorImport(
          target.content,
          'ManyToOne',
        );
        target.content = this.ensureEntityImport(
          target.content,
          entity.className,
          target.filePath,
          entity.filePath,
        );
        target.content = this.insertClassProperty(
          target.content,
          [
            `  @ManyToOne(() => ${entity.className}, ${ownerVariable} => ${ownerVariable}.${relation.ownerProperty})`,
            `  ${relation.inverseProperty}!: ${entity.className};`,
          ].join('\n'),
        );
        target.properties.add(relation.inverseProperty);
        target.propertyTypes.set(entity.className, relation.inverseProperty);
        changed.set(target.filePath, target.content);
      }
    }

    const changedFiles = Array.from(changed, ([path, content]) => ({
      path,
      content,
    }));
    await params.workspace.writeFiles(params.rootDir, changedFiles);
    return changedFiles.map((file) => file.path);
  }

  installCommands(): CommandSpec[] {
    return [
      {
        command: 'npm',
        args: ['install', '--include=dev'],
        description: 'Install Node dependencies',
      },
    ];
  }

  buildCommands(): CommandSpec[] {
    return [
      {
        command: 'npm',
        args: ['run', 'build'],
        description: 'Compile NestJS application',
      },
    ];
  }

  syntaxCheckCommands(): CommandSpec[] {
    return [
      {
        command: 'npm',
        args: ['run', 'build'],
        description: 'Compile NestJS application',
      },
    ];
  }

  e2eCheckCommands(): CommandSpec[] {
    return [
      {
        command: 'node',
        args: [
          '-e',
          [
            "const { NestFactory } = require('@nestjs/core');",
            "const { ValidationPipe } = require('@nestjs/common');",
            "const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');",
            "const { DataSource } = require('typeorm');",
            "const fs = require('node:fs');",
            "const { AppModule } = require('./dist/app.module');",
            '(async () => {',
            '  const app = await NestFactory.create(AppModule, { logger: false });',
            '  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));',
            "  const config = new DocumentBuilder().setTitle('smoke').setVersion('1').build();",
            '  const document = SwaggerModule.createDocument(app, config);',
            '  const resolveSchema = (schema) => {',
            "    const ref = schema && schema['$ref'];",
            "    return ref ? document.components?.schemas?.[ref.split('/').pop()] : schema;",
            '  };',
            '  for (const [route, pathItem] of Object.entries(document.paths)) {',
            '    for (const [method, operation] of Object.entries(pathItem || {})) {',
            "      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;",
            '      const successResponses = Object.keys(operation.responses || {}).filter((status) => /^2\\d\\d$/.test(status));',
            '      if (successResponses.length === 0) throw new Error(`${method.toUpperCase()} ${route} has no documented 2xx response`);',
            "      const bodySchema = operation.requestBody?.content?.['application/json']?.schema;",
            '      if (bodySchema) {',
            '        const resolved = resolveSchema(bodySchema);',
            '        if (!resolved || Object.keys(resolved.properties || {}).length === 0) throw new Error(`${method.toUpperCase()} ${route} has an empty request schema`);',
            '      }',
            '    }',
            '  }',
            '  const localDataSource = app.get(DataSource);',
            "  const appModuleSource = fs.readFileSync('./src/app.module.ts', 'utf8');",
            '  const productionType = appModuleSource.match(/type:\\s*[\'"](postgres|mysql)[\'"]/)?.[1];',
            "  if (!productionType) throw new Error('Production database type was not found');",
            '  const metadataSource = new DataSource({ type: productionType, entities: localDataSource.entityMetadatas.map((metadata) => metadata.target) });',
            '  await metadataSource.buildMetadatas();',
            "  await app.listen(0, '127.0.0.1');",
            '  const address = app.getHttpServer().address();',
            '  const response = await fetch(`http://127.0.0.1:${address.port}/health`);',
            '  if (!response.ok) throw new Error(`GET /health failed: ${response.status}`);',
            '  for (const [route, pathItem] of Object.entries(document.paths)) {',
            "    if (route.includes('{') || !pathItem?.get || route === '/health') continue;",
            '    const listResponse = await fetch(`http://127.0.0.1:${address.port}${route}`);',
            '    if (listResponse.status >= 500) throw new Error(`GET ${route} failed: ${listResponse.status}`);',
            '  }',
            '  await app.close();',
            '})().catch((error) => { console.error(error); process.exit(1); });',
          ].join('\n'),
        ],
        description:
          'Start the HTTP app, build Swagger, call health, and close',
        env: {
          DATABASE_URL: null,
          NODE_ENV: 'test',
          PORT: null,
        },
      },
    ];
  }

  private normalizeCommonTypescriptSyntax(content: string): string {
    return content.replace(
      /\bthrow\s+(?:a|an)\s+([A-Z][A-Za-z0-9_]*Exception)\s*\(/g,
      'throw new $1(',
    );
  }

  private toKebabCase(value: string) {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  private toPascalCase(value: string) {
    return value
      .replace(/(^|[-_\s]+)([a-zA-Z0-9])/g, (_match, _sep, char: string) =>
        char.toUpperCase(),
      )
      .replace(/[^a-zA-Z0-9]/g, '');
  }

  private toCamelCase(value: string) {
    const pascalCase = this.toPascalCase(value);
    return `${pascalCase.charAt(0).toLowerCase()}${pascalCase.slice(1)}`;
  }

  private normalizeName(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
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

  private escapeSingleQuote(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private mergeNestAppModule(
    existingContent: string,
    nextContent: string,
  ): string {
    const importDeclarations = this.mergeImportDeclarations([
      ...this.extractImportDeclarations(existingContent),
      ...this.extractImportDeclarations(nextContent),
    ]).sort((left, right) => {
      if (left.includes("'@nestjs/common'")) return -1;
      if (right.includes("'@nestjs/common'")) return 1;
      return left.localeCompare(right);
    });

    let moduleImports = this.dedupeModuleImports(
      Array.from(
        new Set([
          ...this.extractModuleArray(existingContent, 'imports'),
          ...this.extractModuleArray(nextContent, 'imports'),
        ]),
      ).filter(Boolean),
    );
    const databaseDeclaration =
      existingContent.match(
        /const\s+databaseConfig\s*=\s*process\.env\.DATABASE_URL[\s\S]*?\n\s*};/,
      )?.[0] ?? '';
    if (databaseDeclaration) {
      moduleImports = [
        'TypeOrmModule.forRoot(databaseConfig)',
        ...moduleImports.filter(
          (moduleImport) => !moduleImport.startsWith('TypeOrmModule.forRoot('),
        ),
      ];
      const rootEntities = importDeclarations.flatMap((declaration) => {
        const match = declaration.match(
          /^import\s+\{\s*(\w+)\s*\}\s+from\s+['"]\.[^'"]+\.entity['"];$/,
        );
        return match ? [match[1]] : [];
      });
      if (rootEntities.length > 0) {
        moduleImports = [
          ...moduleImports.filter(
            (moduleImport) =>
              !moduleImport.startsWith('TypeOrmModule.forFeature('),
          ),
          `TypeOrmModule.forFeature([${[...new Set(rootEntities)].sort().join(', ')}])`,
        ];
      }
    }
    const controllers = Array.from(
      new Set([
        ...this.extractModuleArray(existingContent, 'controllers'),
        ...this.extractModuleArray(nextContent, 'controllers'),
      ]),
    ).filter(Boolean);
    const providers = Array.from(
      new Set([
        ...this.extractModuleArray(existingContent, 'providers'),
        ...this.extractModuleArray(nextContent, 'providers'),
      ]),
    ).filter(Boolean);

    if (moduleImports.length === 0) {
      return nextContent;
    }

    return [
      ...importDeclarations,
      '',
      ...(databaseDeclaration ? [databaseDeclaration, ''] : []),
      '@Module({',
      '  imports: [',
      ...moduleImports.map((moduleImport) => `    ${moduleImport},`),
      '  ],',
      ...(controllers.length > 0
        ? [
            '  controllers: [',
            ...controllers.map((controller) => `    ${controller},`),
            '  ],',
          ]
        : []),
      ...(providers.length > 0
        ? [
            '  providers: [',
            ...providers.map((provider) => `    ${provider},`),
            '  ],',
          ]
        : []),
      '})',
      'export class AppModule {}',
      '',
    ].join('\n');
  }

  private extractImportDeclarations(content: string): string[] {
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('import ') && line.endsWith(';'));
  }

  private mergeImportDeclarations(declarations: string[]): string[] {
    const namedByModule = new Map<string, Set<string>>();
    const other = new Set<string>();
    for (const declaration of declarations) {
      const named = declaration.match(
        /^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;$/,
      );
      if (!named) {
        other.add(declaration);
        continue;
      }
      const names = namedByModule.get(named[3]) ?? new Set<string>();
      named[1]
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .forEach((name) => names.add(name));
      namedByModule.set(named[3], names);
    }
    return [
      ...other,
      ...Array.from(
        namedByModule,
        ([moduleName, names]) =>
          `import { ${[...names].sort().join(', ')} } from '${moduleName}';`,
      ),
    ];
  }

  private extractModuleArray(content: string, propertyName: string): string[] {
    const moduleIndex = content.indexOf('@Module');
    if (moduleIndex === -1) {
      return [];
    }

    const propertyMatch = new RegExp(`\\b${propertyName}\\s*:`).exec(
      content.slice(moduleIndex),
    );
    if (!propertyMatch) {
      return [];
    }

    const propertyIndex = moduleIndex + propertyMatch.index;
    const bracketStart = content.indexOf('[', propertyIndex);
    if (bracketStart === -1) {
      return [];
    }

    const bracketEnd = this.findMatchingBracket(content, bracketStart);
    if (bracketEnd === -1) {
      return [];
    }

    return this.splitTopLevelCommaList(
      content.slice(bracketStart + 1, bracketEnd),
    );
  }

  private findMatchingBracket(content: string, bracketStart: number): number {
    let depth = 0;
    for (let index = bracketStart; index < content.length; index += 1) {
      const char = content[index];
      if (char === '[') {
        depth += 1;
      }
      if (char === ']') {
        depth -= 1;
      }
      if (depth === 0) {
        return index;
      }
    }
    return -1;
  }

  private splitTopLevelCommaList(value: string): string[] {
    const items: string[] = [];
    let current = '';
    let depth = 0;
    let quote: string | undefined;

    for (const char of value) {
      if (quote) {
        current += char;
        if (char === quote) {
          quote = undefined;
        }
        continue;
      }

      if (char === "'" || char === '"' || char === '`') {
        quote = char;
        current += char;
        continue;
      }

      if (char === '(' || char === '[' || char === '{') {
        depth += 1;
      }
      if (char === ')' || char === ']' || char === '}') {
        depth -= 1;
      }

      if (char === ',' && depth === 0) {
        const item = current.trim();
        if (item) {
          items.push(item);
        }
        current = '';
        continue;
      }

      current += char;
    }

    const item = current.trim();
    if (item) {
      items.push(item);
    }
    return items;
  }

  private dedupeModuleImports(moduleImports: string[]): string[] {
    const typeOrmForRoot = moduleImports
      .filter((moduleImport) =>
        moduleImport.startsWith('TypeOrmModule.forRoot('),
      )
      .sort((left, right) => right.length - left.length)[0];
    const withoutDuplicateTypeOrmRoot = moduleImports.filter(
      (moduleImport) => !moduleImport.startsWith('TypeOrmModule.forRoot('),
    );

    return typeOrmForRoot
      ? [typeOrmForRoot, ...withoutDuplicateTypeOrmRoot]
      : withoutDuplicateTypeOrmRoot;
  }

  private parseEntityFile(filePath: string, content: string) {
    const className = content.match(/export\s+class\s+(\w+)/)?.[1] ?? '';
    const propertyTypes = new Map<string, string>();
    const properties = new Set<string>();
    const arrayProperties = new Set<string>();
    const propertyPattern = /^\s*(\w+)[!?]?:\s*([\w\[\]]+)/gm;
    let propertyMatch: RegExpExecArray | null;

    while ((propertyMatch = propertyPattern.exec(content))) {
      const propertyName = propertyMatch[1];
      const propertyType = propertyMatch[2].replace(/\[\]$/, '');
      properties.add(propertyName);
      if (propertyMatch[2].endsWith('[]')) {
        arrayProperties.add(propertyName);
      }
      propertyTypes.set(propertyType, propertyName);
    }

    return {
      filePath,
      content,
      className,
      properties,
      arrayProperties,
      propertyTypes,
    };
  }

  private parseOwningRelations(content: string) {
    const relations: Array<{
      raw: string;
      decorator: 'ManyToOne' | 'OneToOne';
      targetClass: string;
      inverseProperty: string;
      sourceVariable: string;
      sourceProperty: string;
    }> = [];
    const relationPattern =
      /@(ManyToOne|OneToOne)\(\s*\(\)\s*=>\s*(\w+)\s*,\s*(\w+)\s*=>\s*\3\.(\w+)\s*\)\s*\n\s*(\w+)[!?]?:\s*(\w+)/g;
    let relationMatch: RegExpExecArray | null;

    while ((relationMatch = relationPattern.exec(content))) {
      const decorator = relationMatch[1] as 'ManyToOne' | 'OneToOne';
      relations.push({
        raw: relationMatch[0],
        decorator,
        targetClass: relationMatch[2],
        inverseProperty: relationMatch[4],
        sourceVariable: this.toCamelCase(relationMatch[6]),
        sourceProperty: relationMatch[5],
      });
    }

    return relations;
  }

  private parseInverseRelations(content: string) {
    const relations: Array<{
      raw: string;
      targetClass: string;
      inverseProperty: string;
      ownerProperty: string;
    }> = [];
    // Matches a non-owning @OneToMany whose inverse lambda points at a property
    // the owning entity is expected to declare, e.g.
    //   @OneToMany(() => HealthMetric, m => m.user)
    //   healthMetrics!: HealthMetric[];
    const relationPattern =
      /@OneToMany\(\s*\(\)\s*=>\s*(\w+)\s*,\s*(\w+)\s*=>\s*\2\.(\w+)\s*\)\s*\n\s*(\w+)[!?]?:\s*(\w+)\[\]/g;
    let relationMatch: RegExpExecArray | null;

    while ((relationMatch = relationPattern.exec(content))) {
      // Only reconcile when the collection element type matches the target
      // class the decorator references; anything else is malformed input.
      if (relationMatch[1] !== relationMatch[5]) {
        continue;
      }

      relations.push({
        raw: relationMatch[0],
        targetClass: relationMatch[1],
        inverseProperty: relationMatch[3],
        ownerProperty: relationMatch[4],
      });
    }

    return relations;
  }

  private ensureTypeOrmDecoratorImport(content: string, decoratorName: string) {
    const importPattern = /import\s+\{([^}]+)\}\s+from\s+['"]typeorm['"];?/;
    const match = content.match(importPattern);
    if (!match) {
      return `import { ${decoratorName} } from 'typeorm';\n${content}`;
    }

    const imports = match[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (imports.includes(decoratorName)) {
      return content;
    }

    return content.replace(
      importPattern,
      `import { ${[...imports, decoratorName].sort().join(', ')} } from 'typeorm';`,
    );
  }

  private ensureUsedTypeOrmDecoratorImports(content: string) {
    return ['ManyToOne', 'OneToMany', 'OneToOne', 'JoinColumn'].reduce(
      (current, decoratorName) =>
        current.includes(`@${decoratorName}`)
          ? this.ensureTypeOrmDecoratorImport(current, decoratorName)
          : current,
      content,
    );
  }

  private ensureEntityImport(
    content: string,
    className: string,
    fromFilePath: string,
    toFilePath: string,
  ) {
    if (new RegExp(`import\\s+\\{\\s*${className}\\s*\\}`).test(content)) {
      return content;
    }

    const fromDir = fromFilePath.split('/').slice(0, -1);
    const toParts = toFilePath.replace(/\.ts$/, '').split('/');
    const toWithoutFile = toParts.slice(0, -1);
    const commonPrefixLength = fromDir.findIndex(
      (part, index) => part !== toWithoutFile[index],
    );
    const sharedLength =
      commonPrefixLength === -1
        ? Math.min(fromDir.length, toWithoutFile.length)
        : commonPrefixLength;
    const upSegments = fromDir.slice(sharedLength).map(() => '..');
    const downSegments = toParts.slice(sharedLength);
    const relativePath = [...upSegments, ...downSegments].join('/');
    const importPath = relativePath.startsWith('.')
      ? relativePath
      : `./${relativePath}`;

    return `import { ${className} } from '${importPath}';\n${content}`;
  }

  private insertClassProperty(content: string, propertyBlock: string) {
    const classEnd = content.lastIndexOf('}');
    if (classEnd === -1) {
      return content;
    }

    return `${content.slice(0, classEnd).trimEnd()}\n\n${propertyBlock}\n${content.slice(classEnd)}`;
  }

  private normalizePackageJson(content: string) {
    const packageJson = this.parseJsonObject(content);
    packageJson.scripts = {
      ...this.asRecord(packageJson.scripts),
      build: 'nest build',
      start: 'node dist/main.js',
    };
    packageJson.dependencies = {
      ...this.asRecord(packageJson.dependencies),
      '@nestjs/common': '^10.4.15',
      '@nestjs/core': '^10.4.15',
      '@nestjs/platform-express': '^10.4.15',
      '@nestjs/swagger': '^7.4.2',
      '@nestjs/typeorm': '^10.0.2',
      'class-transformer': '^0.5.1',
      'class-validator': '^0.14.1',
      'reflect-metadata': '^0.2.2',
      'sql.js': '^1.10.3',
      pg: '^8.13.1',
      mysql2: '^3.11.5',
      'swagger-ui-express': '^5.0.1',
      typeorm: '^0.3.20',
      rxjs: '^7.8.1',
    };
    packageJson.devDependencies = {
      ...this.asRecord(packageJson.devDependencies),
      '@nestjs/cli': '^10.4.8',
      '@types/node': '^22.10.2',
      typescript: '^5.7.2',
    };

    // The test toolchain is owned by the pipeline's test adapter, which
    // injects jest/ts-jest at versions compatible with the TypeScript above.
    // Drop any copy the LLM invents (e.g. ts-jest@^27, which peer-requires
    // typescript <5.0 and makes `npm install` fail ERESOLVE against ts@5.x).
    const pipelineOwnedDevDeps = new Set([
      'jest',
      'ts-jest',
      '@types/jest',
      'ts-loader',
      'supertest',
      '@types/supertest',
    ]);
    packageJson.devDependencies = Object.fromEntries(
      Object.entries(this.asRecord(packageJson.devDependencies)).filter(
        ([name]) => !pipelineOwnedDevDeps.has(name),
      ),
    );

    // A package pinned in dependencies must not reappear in devDependencies
    // with a different (possibly conflicting) version the LLM invented.
    const dependencies = this.asRecord(packageJson.dependencies);
    packageJson.devDependencies = Object.fromEntries(
      Object.entries(this.asRecord(packageJson.devDependencies)).filter(
        ([name]) => !(name in dependencies),
      ),
    );

    return `${JSON.stringify(packageJson, null, 2)}\n`;
  }

  private normalizeTsConfig(content: string) {
    const tsConfig = this.parseJsonObject(content);
    tsConfig.compilerOptions = {
      ...this.asRecord(tsConfig.compilerOptions),
      module: 'Node16',
      target: 'ES2022',
      moduleResolution: 'node16',
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
      skipLibCheck: true,
      strictPropertyInitialization: false,
      outDir: './dist',
      sourceMap: true,
    };
    return `${JSON.stringify(tsConfig, null, 2)}\n`;
  }

  private parseJsonObject(content: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(content) as unknown;
      return this.asRecord(parsed);
    } catch {
      return {};
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }
}
