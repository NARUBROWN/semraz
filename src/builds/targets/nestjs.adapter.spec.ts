import { NestJsTargetAdapter } from './nestjs.adapter';
import { AppSpec, BuildTaskKind } from '../types/build.types';

describe('NestJsTargetAdapter', () => {
  const adapter = new NestJsTargetAdapter({} as never);

  const spec: AppSpec = {
    projectName: 'Endpoint Driven API',
    summary: '',
    entities: [
      {
        name: 'User',
        fields: [
          { name: 'id', type: 'uuid', required: true },
          { name: 'email', type: 'string', required: true },
        ],
        relations: [],
        endpoints: [
          {
            method: 'POST',
            path: '/users',
            operationName: 'Create User',
            requestFields: [{ name: 'email', type: 'string' }],
          },
          {
            method: 'GET',
            path: '/users/:id',
            operationName: 'Get User',
            requestFields: [{ name: 'id', type: 'uuid' }],
          },
        ],
        businessRules: [],
      },
      {
        name: 'Profile',
        fields: [
          { name: 'id', type: 'uuid', required: true },
          { name: 'displayName', type: 'string', required: true },
        ],
        relations: [],
        endpoints: [],
        businessRules: [],
      },
    ],
    endpoints: [],
    businessRules: [],
    assumptions: [],
  };

  it('installs local build tools even when the server runs in production mode', () => {
    expect(adapter.installCommands()).toEqual([
      expect.objectContaining({
        command: 'npm',
        args: ['install', '--include=dev'],
      }),
    ]);
  });

  it('plans feature tasks only for entities with explicit endpoints', () => {
    const featureTasks = adapter
      .planBuildTasks(spec)
      .tasks.filter(
        (task) => task.kind === ('crud-feature' satisfies BuildTaskKind),
      );

    expect(featureTasks).toHaveLength(1);
    expect(featureTasks[0].targetEntity).toBe('User');
  });

  it('includes endpoint details in the task generation prompt', () => {
    const task = adapter
      .planBuildTasks(spec)
      .tasks.find(
        (candidate) =>
          candidate.kind === 'crud-feature' &&
          candidate.targetEntity === 'User',
      );

    const prompt = adapter.taskGenerationPrompt({
      spec,
      task: task!,
      context: {
        task,
        entity: spec.entities[0],
        relevantFiles: ['src/app.module.ts'],
        fileContents: [],
        symbols: [],
        previousFailures: [],
        instructions: [],
      },
    });

    expect(prompt).toContain('Create User');
    expect(prompt).toContain('/users/:id');
    expect(prompt).toContain('allowedFiles');
    expect(prompt).toContain('ParseUUIDPipe');
    expect(prompt).toContain('raw foreign-key violation');
    expect(prompt).toContain('@ApiOperation');
  });

  it('plans a dedicated endpoint workflow task for non-CRUD endpoints', () => {
    const workflowSpec: AppSpec = {
      ...spec,
      entities: [
        {
          ...spec.entities[0],
          name: 'AirQualityData',
          endpoints: [
            {
              method: 'POST',
              path: '/api/air-quality-data',
              operationName: '대기질 데이터 입력',
            },
            {
              method: 'GET',
              path: '/api/air-quality-data/review',
              operationName: '대기질 데이터 검토',
              description: '관리자가 수집된 환경 데이터를 검토합니다.',
              implementationRequirements: '데이터 유효성 검사 후 오류 알림',
            },
            {
              method: 'POST',
              path: '/api/air-quality-data/alert',
              operationName: '이상 징후 감지 및 알림 전송',
              description:
                '정기적으로 환경 데이터를 분석하여 이상 징후를 감지합니다.',
              implementationRequirements: '비동기 처리 및 알림 전송 규칙',
            },
          ],
        },
      ],
    };

    const workflowTask = adapter
      .planBuildTasks(workflowSpec)
      .tasks.find((task) => task.kind === 'endpoint-workflow');

    expect(workflowTask).toBeDefined();
    expect(workflowTask?.dependsOn).toContain('feature-air-quality-data-crud');
    expect(workflowTask?.description).toContain('/api/air-quality-data/review');
    expect(workflowTask?.description).toContain(
      '데이터 유효성 검사 후 오류 알림',
    );
    expect(workflowTask?.description).toContain('/api/air-quality-data/alert');
    expect(workflowTask?.doneCriteria.join('\n')).toContain('No TODO');
  });

  it('strips the LLM test toolchain so ts-jest cannot conflict with typescript 5.x', () => {
    // Reproduces a real generated package.json whose ts-jest@^27 peer-requires
    // typescript <5.0 and made `npm install` fail ERESOLVE against ts@^5.7.2.
    const generated = JSON.stringify({
      name: 'medical-tracker',
      version: '1.0.0',
      devDependencies: {
        typescript: '^5.7.2',
        jest: '^27.0.0',
        'ts-jest': '^27.0.0',
        '@types/jest': '^27.0.0',
        'ts-loader': '^9.0.0',
      },
    });

    const [normalized] = adapter.normalizeGeneratedFiles([
      { path: 'package.json', content: generated },
    ]);
    const pkg = JSON.parse(normalized.content) as {
      devDependencies: Record<string, string>;
    };

    // The pipeline's test adapter owns jest/ts-jest at compatible versions.
    expect(pkg.devDependencies).not.toHaveProperty('jest');
    expect(pkg.devDependencies).not.toHaveProperty('ts-jest');
    expect(pkg.devDependencies).not.toHaveProperty('@types/jest');
    expect(pkg.devDependencies).not.toHaveProperty('ts-loader');
    // TypeScript stays pinned by the pipeline.
    expect(pkg.devDependencies.typescript).toBe('^5.7.2');
  });

  it('synthesizes the missing @ManyToOne owning side for a dangling @OneToMany', async () => {
    // Reproduces a real build break: User declares @OneToMany(() => HealthMetric,
    // m => m.user) but HealthMetric never declares the owning `user` relation,
    // so `m.user` fails TS2339 during `nest build`.
    const files: Record<string, string> = {
      'src/user/user.entity.ts': [
        "import { HealthMetric } from '../health-metric/health-metric.entity';",
        "import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';",
        '',
        '@Entity()',
        'export class User {',
        "  @PrimaryGeneratedColumn('uuid')",
        '  id!: string;',
        '',
        '  @OneToMany(() => HealthMetric, user => user.user)',
        '  healthMetrics!: HealthMetric[];',
        '}',
        '',
      ].join('\n'),
      'src/health-metric/health-metric.entity.ts': [
        "import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';",
        '',
        '@Entity()',
        'export class HealthMetric {',
        "  @PrimaryGeneratedColumn('uuid')",
        '  id!: string;',
        '',
        '  @Column()',
        '  userId!: string;',
        '}',
        '',
      ].join('\n'),
    };

    const workspace = {
      listFiles: async () => Object.keys(files),
      resolveInside: (_root: string, filePath: string) => filePath,
      readTextFile: async (filePath: string) => files[filePath],
      writeFiles: async (
        _root: string,
        changed: Array<{ path: string; content: string }>,
      ) => {
        for (const file of changed) {
          files[file.path] = file.content;
        }
      },
    };

    const changed = await adapter.postProcessAppliedFiles({
      rootDir: '/app',
      changedFiles: ['src/health-metric/health-metric.entity.ts'],
      workspace: workspace as never,
    });

    const healthMetric = files['src/health-metric/health-metric.entity.ts'];
    expect(changed).toContain('src/health-metric/health-metric.entity.ts');
    expect(healthMetric).toContain(
      '@ManyToOne(() => User, user => user.healthMetrics)',
    );
    expect(healthMetric).toMatch(/user!:\s*User;/);
    expect(healthMetric).toContain(
      "import { User } from '../user/user.entity';",
    );
    expect(healthMetric).toMatch(
      /import \{[^}]*\bManyToOne\b[^}]*\} from 'typeorm';/,
    );
  });

  it('uses a real application bootstrap as the E2E gate', () => {
    const [command] = adapter.e2eCheckCommands();

    expect(command.command).toBe('node');
    expect(command.args.join('\n')).toContain('NestFactory.create');
    expect(command.args.join('\n')).toContain('SwaggerModule.createDocument');
    expect(command.args.join('\n')).toContain("app.listen(0, '127.0.0.1')");
    expect(command.args.join('\n')).toContain('/health');
    expect(command.args.join('\n')).toContain('app.close()');
    expect(command.env).toEqual({
      DATABASE_URL: null,
      NODE_ENV: 'test',
      PORT: null,
    });
  });

  it('repairs article-inserted exception throws deterministically', () => {
    const [file] = adapter.normalizeGeneratedFiles([
      {
        path: 'src/waste-data/waste-data.service.ts',
        content:
          'throw a NotFoundException(`missing`);\nthrow an BadRequestException(`bad`);',
      },
    ]);

    expect(file.content).toBe(
      'throw new NotFoundException(`missing`);\nthrow new BadRequestException(`bad`);',
    );
  });

  it('removes driver-specific timestamp metadata for the dual database runtime', () => {
    const [file] = adapter.normalizeGeneratedFiles([
      {
        path: 'src/event/event.entity.ts',
        content: "@Column({ type: 'timestamp' })\ncreatedAt!: string;",
      },
    ]);

    expect(file.content).toContain('@Column()');
    expect(file.content).not.toContain("type: 'datetime'");
    expect(file.content).not.toContain("type: 'timestamp'");
  });

  it('normalizes enum columns for SQL.js verification and the production driver', () => {
    const [file] = adapter.normalizeGeneratedFiles([
      {
        path: 'src/field/field.entity.ts',
        content:
          "@Column({ type: 'enum', enum: ['ACTIVE', 'INACTIVE'] })\nstatus!: string;",
      },
    ]);

    expect(file.content).toContain("type: 'simple-enum'");
    expect(file.content).not.toContain("type: 'enum'");
  });

  it('lets ORM registration repair entity metadata without requiring entity rewrites', () => {
    const task = adapter
      .planBuildTasks(spec)
      .tasks.find((candidate) => candidate.kind === 'orm-registration')!;

    expect(task.allowedFiles).toEqual(
      expect.arrayContaining([
        'src/app.module.ts',
        'src/user/user.entity.ts',
        'src/profile/profile.entity.ts',
      ]),
    );
    expect(adapter.requiredTaskFiles(task)).toEqual(['src/app.module.ts']);
  });

  it('rejects nullable ERD-required fields and missing endpoint routes', () => {
    const entityTask = adapter
      .planBuildTasks(spec)
      .tasks.find((task) => task.id === 'entity-user-fields')!;
    expect(
      adapter.validateTaskFiles({
        spec,
        task: entityTask,
        files: [
          {
            path: 'src/user/user.entity.ts',
            content: '@Column({ nullable: true })\nemail?: string;',
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('User.id'),
        expect.stringContaining('User.email'),
      ]),
    );

    const crudTask = adapter
      .planBuildTasks(spec)
      .tasks.find((task) => task.id === 'feature-user-crud')!;
    const crudProblems = adapter.validateTaskFiles({
      spec,
      task: crudTask,
      files: [
        {
          path: 'src/user/user.controller.ts',
          content:
            "@Controller('users')\nclass UserController { @Post() create() {} }",
        },
      ],
    });
    expect(crudProblems).toContain('controller is missing GET /users/:id');
    expect(crudProblems).toContain('User controller must declare @ApiTags');
    expect(crudProblems).toContain(
      'User controller must document every route with @ApiOperation',
    );
  });

  it('requires server-managed entity timestamps', () => {
    const timestampSpec: AppSpec = {
      ...spec,
      entities: [
        {
          ...spec.entities[0],
          fields: [
            ...spec.entities[0].fields,
            { name: 'createdAt', type: 'datetime', required: true },
            { name: 'updatedAt', type: 'datetime', required: true },
          ],
        },
      ],
    };
    const task = adapter
      .planBuildTasks(timestampSpec)
      .tasks.find((candidate) => candidate.id === 'entity-user-fields')!;
    const problems = adapter.validateTaskFiles({
      spec: timestampSpec,
      task,
      files: [
        {
          path: 'src/user/user.entity.ts',
          content: [
            '@Column() id!: string;',
            '@Column() email!: string;',
            '@Column() createdAt!: Date;',
            '@Column() updatedAt!: Date;',
          ].join('\n'),
        },
      ],
    });

    expect(problems).toContain(
      'User.createdAt must use @CreateDateColumn so it is server-managed',
    );
    expect(problems).toContain(
      'User.updatedAt must use @UpdateDateColumn so it is server-managed',
    );
  });

  it('uses the endpoint skeleton as an exact API allowlist', () => {
    const task = adapter
      .planBuildTasks(spec)
      .tasks.find((candidate) => candidate.id === 'feature-user-crud')!;
    const problems = adapter.validateTaskFiles({
      spec,
      task,
      files: [
        {
          path: 'src/user/user.controller.ts',
          content: [
            "@Controller('/users')",
            'class UserController {',
            '  @Post() create() {}',
            "  @Get(':id') findOne() {}",
            "  @Delete(':id') remove() {}",
            '}',
          ].join('\n'),
        },
      ],
    });

    expect(problems).toContain(
      'controller exposes API not present in the endpoint skeleton: DELETE /users/:id',
    );
    expect(problems).not.toContain(expect.stringContaining('//users'));
  });

  it('rejects missing global routes and less common Nest route decorators', () => {
    const files = adapter
      .bootstrapFiles(spec)
      .filter((file) => file.path !== 'src/app.controller.ts');
    const problems = adapter.validateApplicationFiles({
      spec,
      files: [
        ...files,
        {
          path: 'src/app.controller.ts',
          content:
            "@Controller() class AppController { @Get('health') health() {} }",
        },
        {
          path: 'src/user/user.entity.ts',
          content: '@Column() id!: string;\n@Column() email!: string;',
        },
        {
          path: 'src/user/user.controller.ts',
          content:
            "@Controller('users') class C { @Post() create() {} @All('escape') escape() {} }",
        },
      ],
    });
    expect(problems).toContain(
      'global endpoint skeleton is missing from generated controllers: GET /users/:id',
    );
    expect(problems).toEqual(
      expect.arrayContaining([expect.stringContaining('ALL /users/escape')]),
    );
  });

  it('preserves separately named relations between the same entity pair', () => {
    const multiRelationSpec: AppSpec = {
      ...spec,
      entities: [
        {
          ...spec.entities[0],
          relations: [],
          endpoints: [],
        },
        {
          ...spec.entities[1],
          name: 'Document',
          relations: [
            { target: 'User', property: 'createdBy', cardinality: 'N:1' },
            { target: 'User', property: 'approvedBy', cardinality: 'N:1' },
          ],
        },
      ],
    };
    const relationTask = adapter
      .planBuildTasks(multiRelationSpec)
      .tasks.find((task) => task.kind === 'entity-relations')!;
    expect(relationTask.description).toContain('createdBy');
    expect(relationTask.description).toContain('approvedBy');
  });

  it('maps a large relation graph into bounded shards and reduces at ORM registration', () => {
    const entities = Array.from({ length: 26 }, (_, index) => ({
      name: `Entity${index}`,
      fields: [{ name: 'id', type: 'uuid', required: true }],
      relations:
        index < 25
          ? [
              {
                source: `Entity${index}`,
                target: `Entity${index + 1}`,
                cardinality: '1:N',
              },
            ]
          : [],
      endpoints: [],
      businessRules: [],
    }));
    const largeSpec: AppSpec = { ...spec, entities };
    const plan = adapter.planBuildTasks(largeSpec);
    const maps = plan.tasks.filter((task) =>
      task.id.startsWith('entity-relations-map-'),
    );
    const reduce = plan.tasks.find((task) => task.id === 'orm-registration')!;

    expect(maps.length).toBeGreaterThan(1);
    expect(maps.every((task) => task.allowedFiles.length <= 20)).toBe(true);
    expect(reduce.dependsOn).toEqual(
      expect.arrayContaining([
        ...entities.map(
          (entity) =>
            `entity-${entity.name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}-fields`,
        ),
        ...maps.map((task) => task.id),
      ]),
    );
  });

  it('bootstraps PostgreSQL as production config with a SQL.js smoke fallback', () => {
    const files = new Map(
      adapter.bootstrapFiles(spec).map((file) => [file.path, file.content]),
    );
    expect(files.get('src/app.module.ts')).toContain('DATABASE_URL');
    expect(files.get('src/app.module.ts')).toContain("type: 'postgres'");
    expect(files.get('src/app.module.ts')).toContain("type: 'sqljs'");
    expect(JSON.parse(files.get('package.json')!).dependencies).toHaveProperty(
      'pg',
    );
  });

  it('bootstraps strict validation and Swagger DTO metadata generation', () => {
    const files = new Map(
      adapter.bootstrapFiles(spec).map((file) => [file.path, file.content]),
    );

    expect(files.get('src/main.ts')).toContain('forbidNonWhitelisted: true');
    expect(files.get('nest-cli.json')).toContain('@nestjs/swagger');
    expect(files.get('nest-cli.json')).toContain('classValidatorShim');
  });

  it('uses the final E2E gate to reject empty OpenAPI request schemas', () => {
    const command = adapter.e2eCheckCommands()[0].args.join('\n');

    expect(command).toContain('has an empty request schema');
    expect(command).toContain('has no documented 2xx response');
    expect(command).toContain('listResponse.status >= 500');
  });

  it('rejects routes invented by any controller during the final contract gate', () => {
    const bootstrap = adapter.bootstrapFiles(spec);
    const problems = adapter.validateApplicationFiles({
      spec,
      files: [
        ...bootstrap,
        {
          path: 'src/user/user.entity.ts',
          content: '@Column()\nid!: string;\n@Column()\nemail!: string;',
        },
        {
          path: 'src/user/user.controller.ts',
          content:
            "@Controller('users')\nclass C { @Post() a(){} @Get(':id') b(){} }",
        },
        {
          path: 'src/invented/invented.controller.ts',
          content:
            "@Controller('invented')\nclass C { @Delete(':id') remove(){} }",
        },
      ],
    });

    expect(problems).toContain(
      'src/invented/invented.controller.ts: exposes API absent from the global endpoint skeleton: DELETE /invented/:id',
    );
  });

  it('keeps the dual database declaration while merging AppModule features', () => {
    const existing = adapter
      .bootstrapFiles(spec)
      .find((file) => file.path === 'src/app.module.ts')!.content;
    const merged = adapter.mergeGeneratedFile({
      rootDir: '/tmp/app',
      existingContent: existing,
      file: {
        path: 'src/app.module.ts',
        content: [
          "import { Module } from '@nestjs/common';",
          "import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';",
          "import { User } from './user/user.entity';",
          "import { UserModule } from './user/user.module';",
          '@Module({ imports: [UserModule] })',
          'export class AppModule {}',
        ].join('\n'),
      },
    });

    expect(merged.content).toContain('const databaseConfig');
    expect(merged.content).toContain('TypeOrmModule.forRoot(databaseConfig)');
    expect(merged.content).toContain('UserModule');
    expect(merged.content).toContain('TypeOrmModule.forFeature([User])');
    expect(merged.content.match(/from '@nestjs\/typeorm';/g)).toHaveLength(1);
    expect(merged.content).toContain(
      'import { TypeOrmModule, TypeOrmModuleOptions }',
    );
  });

  it('does not allow endpoint tasks to rewrite other entity features', () => {
    const workflowSpec: AppSpec = {
      ...spec,
      entities: spec.entities.map((entity) =>
        entity.name === 'User'
          ? {
              ...entity,
              endpoints: [
                ...entity.endpoints,
                { method: 'POST', path: '/users/:id/activate' },
              ],
            }
          : entity,
      ),
    };
    const task = adapter
      .planBuildTasks(workflowSpec)
      .tasks.find((candidate) => candidate.kind === 'endpoint-workflow');

    expect(task).toBeDefined();
    expect(task?.allowedFiles).not.toContain('src/profile/profile.service.ts');
    expect(task?.allowedFiles).not.toContain('src/profile/profile.module.ts');
  });

  it('normalizes a OneToOne owner when its inverse property is a collection', async () => {
    const files: Record<string, string> = {
      'src/draft/draft.entity.ts': [
        "import { OneToMany } from 'typeorm';",
        'export class Draft {',
        '  @OneToMany(() => ReviewRequest, request => request.draft)',
        '  reviewRequests!: ReviewRequest[];',
        '}',
      ].join('\n'),
      'src/review-request/review-request.entity.ts': [
        "import { OneToOne } from 'typeorm';",
        'export class ReviewRequest {',
        '  @OneToOne(() => Draft, draft => draft.reviewRequests)',
        '  draft!: Draft;',
        '}',
      ].join('\n'),
    };
    const workspace = {
      listFiles: async () => Object.keys(files),
      resolveInside: (_root: string, filePath: string) => filePath,
      readTextFile: async (filePath: string) => files[filePath],
      writeFiles: async (
        _root: string,
        changed: Array<{ path: string; content: string }>,
      ) => changed.forEach((file) => (files[file.path] = file.content)),
    };

    await adapter.postProcessAppliedFiles({
      rootDir: '/app',
      changedFiles: Object.keys(files),
      workspace: workspace as never,
    });

    expect(files['src/review-request/review-request.entity.ts']).toContain(
      '@ManyToOne(() => Draft, draft => draft.reviewRequests)',
    );
  });
});
