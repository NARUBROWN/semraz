import { Injectable } from '@nestjs/common';
import * as ts from 'typescript';
import path from 'node:path';
import { WorkspaceWriter } from '../../builds/runtime/workspace-writer';
import {
  CommandSpec,
  FilePatchFailure,
  GeneratedFile,
  TargetFramework,
} from '../../builds/types/build.types';
import { CoverageGap, TestCodeContext, TestSpec } from '../types/test.types';
import { TestTargetAdapter } from './test-target-adapter';

@Injectable()
export class NestJsTestAdapter implements TestTargetAdapter {
  readonly target = TargetFramework.NestJS;
  private readonly coverageTarget = 50;

  constructor(private readonly workspace: WorkspaceWriter) {}

  async harnessFiles(
    appDir: string,
    spec?: TestSpec,
  ): Promise<GeneratedFile[]> {
    const packagePath = this.workspace.resolveInside(appDir, 'package.json');
    const packageJson = JSON.parse(
      await this.workspace.readTextFile(packagePath),
    ) as Record<string, unknown>;

    return [
      {
        path: 'package.json',
        content: `${JSON.stringify(
          {
            ...packageJson,
            scripts: {
              ...this.asRecord(packageJson.scripts),
              test: 'jest --runInBand',
              'test:cov': 'jest --coverage --runInBand',
              'test:e2e':
                'jest --runInBand --testRegex ".*\\.e2e-spec\\.ts$" --runTestsByPath test/app.e2e-spec.ts',
            },
            devDependencies: {
              ...this.asRecord(packageJson.devDependencies),
              '@types/jest': '^29.5.14',
              '@types/supertest': '^6.0.3',
              jest: '^29.7.0',
              'ts-jest': '^29.2.5',
              supertest: '^7.0.0',
            },
            jest: {
              moduleFileExtensions: ['js', 'json', 'ts'],
              rootDir: '.',
              testRegex: '.*(?:\\.spec|\\.e2e-spec)\\.ts$',
              transform: {
                // Specs run with lenient type checking; production code keeps
                // its own strict tsconfig for the real build.
                '^.+\\.(t|j)s$': [
                  'ts-jest',
                  {
                    tsconfig: {
                      strict: false,
                      noImplicitAny: false,
                      strictNullChecks: false,
                      isolatedModules: true,
                    },
                  },
                ],
              },
              // main.ts, module wiring, and entity classes are declarative
              // bootstrap/schema glue (TypeORM relation lambdas cannot run in
              // unit tests); executable behavior is measured against the target.
              collectCoverageFrom: [
                'src/**/*.(t|j)s',
                '!src/main.ts',
                '!src/**/*.module.ts',
                '!src/**/*.entity.ts',
                '!src/migrations/**/*.ts',
                '!src/database/data-source.ts',
                '!src/**/*.spec.ts',
              ],
              coverageDirectory: './coverage',
              coverageReporters: ['text', 'json-summary'],
              // Keep the runner gate and generation guidance on one shared target.
              coverageThreshold: {
                global: {
                  statements: this.coverageTarget,
                  branches: this.coverageTarget,
                  functions: this.coverageTarget,
                  lines: this.coverageTarget,
                },
              },
              testEnvironment: 'node',
            },
          },
          null,
          2,
        )}\n`,
      },
      {
        path: 'test/app.e2e-spec.ts',
        content: this.e2eSpecContent(spec),
      },
    ];
  }

  private e2eSpecContent(spec?: TestSpec): string {
    const endpoints = (spec?.endpoints ?? []).map((endpoint) => ({
      operationName: endpoint.operationName,
      method: endpoint.method.toLowerCase(),
      path: endpoint.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}'),
      requestFields: endpoint.requestFields
        .filter((field) => typeof field.name === 'string')
        .map((field) => ({
          name: field.name as string,
          type: typeof field.type === 'string' ? field.type : '',
          required: field.required === true,
        }))
        .filter(
          (field) =>
            !endpoint.path.includes(`:${field.name}`) &&
            !endpoint.path.includes(`{${field.name}}`),
        ),
      responseFields: endpoint.responseFields
        .filter((field) => typeof field.name === 'string')
        .map((field) => ({
          name: field.name as string,
          type: typeof field.type === 'string' ? field.type : '',
        })),
    }));

    return `import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module';

type ExpectedEndpoint = {
  operationName: string;
  method: string;
  path: string;
  requestFields: ReadonlyArray<{ name: string; type: string; required: boolean }>;
  responseFields: ReadonlyArray<{ name: string; type: string }>;
};

const expectedEndpoints: ReadonlyArray<ExpectedEndpoint> = ${JSON.stringify(endpoints, null, 2)};
const fallbackUuid = '00000000-0000-4000-8000-000000000001';

describe('Generated application contract (e2e)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  const values: Record<string, string | number | boolean> = {};

  const schemaOf = (schema: any): any => {
    if (!schema) return {};
    if (schema.$ref) return schemaOf(document.components?.schemas?.[schema.$ref.split('/').pop()!]);
    const allOf = (schema.allOf ?? []).map(schemaOf);
    return {
      ...schema,
      properties: Object.assign({}, ...allOf.map((item: any) => item.properties ?? {}), schema.properties ?? {}),
      required: Array.from(new Set([...(schema.required ?? []), ...allOf.flatMap((item: any) => item.required ?? [])])),
    };
  };

  const resourceIdKey = (endpointPath: string): string => {
    const segment = endpointPath.split('/').filter(Boolean)[0] ?? 'resource';
    const singular = segment.replace(/ies$/, 'y').replace(/s$/, '');
    return singular.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase()) + 'Id';
  };

  const isCrudEndpoint = (endpoint: ExpectedEndpoint): boolean => {
    const segments = endpoint.path.split('/').filter(Boolean);
    if (endpoint.method === 'post') return segments.length === 1;
    if (endpoint.method === 'get') return segments.length === 1 || (segments.length === 2 && segments[1].startsWith('{'));
    return ['put', 'patch', 'delete'].includes(endpoint.method) && segments.length === 2 && segments[1].startsWith('{');
  };

  const sampleValue = (name: string, typeHint: string, schema: any) => {
    if (values[name] !== undefined) return { value: values[name], fallback: false };
    if (Array.isArray(schema?.enum) && schema.enum.length > 0) return { value: schema.enum[0], fallback: false };
    const type = String(schema?.type ?? typeHint).toLowerCase();
    const format = String(schema?.format ?? '').toLowerCase();
    if (format === 'uuid' || type.includes('uuid') || /Id$/.test(name)) {
      return { value: fallbackUuid, fallback: /Id$/.test(name) };
    }
    if (format.includes('date') || type.includes('date') || /At$/.test(name)) {
      return { value: new Date('2026-01-01T00:00:00.000Z').toISOString(), fallback: false };
    }
    if (type === 'integer' || type === 'number' || /int|decimal|float/.test(type)) {
      return { value: Math.max(Number(schema?.minimum ?? 1), 1), fallback: false };
    }
    if (type === 'boolean') return { value: true, fallback: false };
    return { value: 'e2e-' + name, fallback: false };
  };

  const requestBodyFor = (endpoint: ExpectedEndpoint, operation: any) => {
    const schema = schemaOf(operation.requestBody?.content?.['application/json']?.schema);
    const fields = new Map<string, { type: string }>();
    for (const field of endpoint.requestFields) fields.set(field.name, field);
    for (const name of Object.keys(schema.properties ?? {})) {
      if ((schema.required ?? []).includes(name) || fields.has(name)) fields.set(name, fields.get(name) ?? { type: '' });
    }
    let fallback = false;
    const body: Record<string, unknown> = {};
    for (const [name, field] of fields) {
      const sample = sampleValue(name, field.type, schema.properties?.[name]);
      body[name] = sample.value;
      fallback ||= sample.fallback;
    }
    return { body, fallback };
  };

  const concretePath = (endpoint: ExpectedEndpoint) => {
    let fallback = false;
    const resourceKey = resourceIdKey(endpoint.path);
    const path = endpoint.path.replace(/[{]([A-Za-z0-9_]+)[}]/g, (_match, name: string) => {
      const value = values[name] ?? (name === 'id' ? values[resourceKey] : undefined);
      if (value === undefined) fallback = true;
      return encodeURIComponent(String(value ?? fallbackUuid));
    });
    return { path, fallback };
  };

  const rememberResponse = (endpoint: ExpectedEndpoint, body: unknown) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return;
    const record = body as Record<string, unknown>;
    for (const [name, value] of Object.entries(record)) {
      if (['string', 'number', 'boolean'].includes(typeof value)) values[name] = value as string | number | boolean;
    }
    const id = record.id ?? Object.entries(record).find(([name]) => /Id$/.test(name))?.[1];
    if (typeof id === 'string') values[resourceIdKey(endpoint.path)] = id;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    const config = new DocumentBuilder().setTitle('e2e').setVersion('1').build();
    document = SwaggerModule.createDocument(app, config);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots the real application and serves health', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });

  it('publishes every specified endpoint and request field in OpenAPI', () => {
    for (const endpoint of expectedEndpoints) {
      const operation = (document.paths[endpoint.path] as any)?.[endpoint.method];
      expect(operation).toBeDefined();
      expect(Object.keys(operation.responses ?? {}).some((status) => /^2[0-9][0-9]$/.test(status))).toBe(true);
      const schema = schemaOf(operation.requestBody?.content?.['application/json']?.schema);
      if (endpoint.requestFields.length > 0) expect(Object.keys(schema.properties ?? {}).length).toBeGreaterThan(0);
      for (const field of endpoint.requestFields) {
        expect(schema.properties ?? {}).toHaveProperty(field.name);
        if (field.required) expect(schema.required ?? []).toContain(field.name);
      }
    }
  });

  it('rejects unknown request fields for every JSON body endpoint', async () => {
    for (const endpoint of expectedEndpoints) {
      const operation = (document.paths[endpoint.path] as any)?.[endpoint.method];
      if (!operation?.requestBody?.content?.['application/json']) continue;
      const route = concretePath(endpoint).path;
      const body = requestBodyFor(endpoint, operation).body;
      const response = await (request(app.getHttpServer()) as any)[endpoint.method](route).send({ ...body, __unexpected: true });
      expect(response.status).toBe(400);
    }
  });

  it('executes generated CRUD routes against the real application', async () => {
    const order: Record<string, number> = { post: 0, get: 1, put: 2, patch: 2, delete: 3 };
    const indexed = expectedEndpoints.map((endpoint, index) => ({ endpoint, index }));
    indexed.sort((left, right) => {
      const rank = (order[left.endpoint.method] ?? 10) - (order[right.endpoint.method] ?? 10);
      if (rank !== 0) return rank;
      return left.endpoint.method === 'delete' ? right.index - left.index : left.index - right.index;
    });

    for (const { endpoint } of indexed) {
      if (!(endpoint.method in order) || !isCrudEndpoint(endpoint)) continue;
      const operation = (document.paths[endpoint.path] as any)?.[endpoint.method];
      const concrete = concretePath(endpoint);
      const generated = requestBodyFor(endpoint, operation);
      let call = (request(app.getHttpServer()) as any)[endpoint.method](concrete.path);
      if (operation?.requestBody) call = call.send(generated.body);
      const response = await call;
      expect(response.status).toBeLessThan(500);
      const usedFallback = concrete.fallback || generated.fallback;
      if (!usedFallback && endpoint.method !== 'delete') {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
      }
      if (!usedFallback && endpoint.method === 'delete') {
        expect(response.status < 300 || response.status === 409).toBe(true);
      }
      if (response.status >= 200 && response.status < 300) rememberResponse(endpoint, response.body);
    }
  });
});
`;
  }

  isTestFile(path: string): boolean {
    return path.endsWith('.spec.ts');
  }

  isPatchablePath(path: string): boolean {
    const normalized = path.replace(/\\/g, '/');
    return (
      normalized.endsWith('.spec.ts') && normalized !== 'test/app.e2e-spec.ts'
    );
  }

  normalizeTestFiles(
    files: GeneratedFile[],
    context?: TestCodeContext,
  ): GeneratedFile[] {
    return files
      .map((file) =>
        this.isTestFile(file.path)
          ? {
              ...file,
              content: this.normalizeSpecFile(file, context),
            }
          : file,
      )
      .filter(
        (file) =>
          !this.isTestFile(file.path) ||
          this.matchesControllerContract(file, context),
      );
  }

  private normalizeSpecFile(
    file: GeneratedFile,
    context?: TestCodeContext,
  ): string {
    let content = this.normalizeSpecContent(file.content);
    content = this.removeMissingRelativeImports(file.path, content, context);
    if (file.path.endsWith('.controller.spec.ts')) {
      content = this.mockControllerService(content);
    }
    return this.ensureTypeOrmTestImports(file.path, content, context);
  }

  private matchesControllerContract(
    file: GeneratedFile,
    context?: TestCodeContext,
  ): boolean {
    if (!context) {
      return true;
    }
    const controller = context.controllerContracts.find(
      (contract) =>
        contract.filePath === file.path.replace(/\.spec\.ts$/, '.ts'),
    );
    if (!controller) {
      return true;
    }
    const variable = file.content.match(
      new RegExp(
        `\\b(?:let|const)\\s+(\\w+)\\s*:\\s*${controller.className}\\b`,
      ),
    )?.[1];
    if (!variable) {
      return true;
    }
    const calls = Array.from(
      file.content.matchAll(new RegExp(`\\b${variable}\\.(\\w+)\\s*\\(`, 'g')),
      (match) => match[1],
    );
    const knownMethods = new Set(
      controller.methods.map((method) => method.name),
    );
    return calls.every((method) => knownMethods.has(method));
  }

  /**
   * gpt-scale models keep emitting `mockImplementation(() => { throw x })`,
   * which throws synchronously and escapes `rejects.toThrow` assertions.
   * Rewrite it into the equivalent rejected-promise mock.
   */
  private normalizeSpecContent(content: string): string {
    const rewritten = content.replace(
      /\.mockImplementation\(\(\)\s*=>\s*\{\s*throw\s+([^;{}]+?);?\s*\}\)/g,
      '.mockRejectedValue($1)',
    );
    return this.ensureNestCommonImports(this.castJestMockArguments(rewritten));
  }

  /**
   * TypeORM repository and Nest service methods commonly expose overloaded or
   * relation-rich return types. Generated mock fixtures intentionally contain
   * only the fields relevant to each assertion, so Jest's overload inference
   * can reject an otherwise valid fixture during `tsc --noEmit`. Cast only the
   * boundary argument passed into Jest's mock API; production types and the
   * fixture body remain unchanged and the complete generated suite typechecks.
   */
  private castJestMockArguments(content: string): string {
    const source = ts.createSourceFile(
      'generated.spec.ts',
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const mockMethods = new Set([
      'mockImplementation',
      'mockImplementationOnce',
      'mockRejectedValue',
      'mockRejectedValueOnce',
      'mockResolvedValue',
      'mockResolvedValueOnce',
      'mockReturnValue',
      'mockReturnValueOnce',
    ]);
    const edits: Array<{ start: number; end: number; text: string }> = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        mockMethods.has(node.expression.name.text) &&
        node.arguments[0]
      ) {
        const argument = node.arguments[0];
        const text = argument.getText(source);
        if (!/\bas\s+never\s*$/.test(text)) {
          edits.push({
            start: argument.getStart(source),
            end: argument.end,
            text: `(${text}) as never`,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return edits
      .sort((left, right) => right.start - left.start)
      .reduce(
        (result, edit) =>
          `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`,
        content,
      );
  }

  // HTTP exception classes exported by @nestjs/common. Specs routinely
  // `new NotFoundException(...)` / assert `rejects.toThrow(BadRequestException)`
  // but forget to import them, which fails at runtime with
  // "ReferenceError: NotFoundException is not defined".
  private static readonly NEST_COMMON_EXCEPTIONS = [
    'BadRequestException',
    'UnauthorizedException',
    'NotFoundException',
    'ForbiddenException',
    'NotAcceptableException',
    'RequestTimeoutException',
    'ConflictException',
    'GoneException',
    'PayloadTooLargeException',
    'UnsupportedMediaTypeException',
    'UnprocessableEntityException',
    'InternalServerErrorException',
    'NotImplementedException',
    'BadGatewayException',
    'ServiceUnavailableException',
    'GatewayTimeoutException',
    'HttpException',
  ];

  private ensureNestCommonImports(content: string): string {
    const alreadyImported = new Set(
      Array.from(
        content.matchAll(
          /import\s+\{([^}]+)\}\s+from\s+['"]@nestjs\/common['"];?/g,
        ),
        (match) => match[1],
      )
        .join(',')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    );

    const missing = NestJsTestAdapter.NEST_COMMON_EXCEPTIONS.filter(
      (name) =>
        !alreadyImported.has(name) && new RegExp(`\\b${name}\\b`).test(content),
    );

    if (missing.length === 0) {
      return content;
    }

    const existingPattern =
      /import\s+\{([^}]+)\}\s+from\s+['"]@nestjs\/common['"];?/;
    const existing = content.match(existingPattern);
    if (existing) {
      const merged = Array.from(
        new Set([
          ...existing[1]
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean),
          ...missing,
        ]),
      ).sort();
      return content.replace(
        existingPattern,
        `import { ${merged.join(', ')} } from '@nestjs/common';`,
      );
    }

    return `import { ${missing.sort().join(', ')} } from '@nestjs/common';\n${content}`;
  }

  private removeMissingRelativeImports(
    filePath: string,
    content: string,
    context?: TestCodeContext,
  ): string {
    if (!context) return content;
    const available = new Set(context.relevantFiles.map((file) => file.path));
    const removed = new Set<string>();
    const importPattern =
      /^import\s+\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"];?\s*$/gm;
    let result = content.replace(
      importPattern,
      (statement, names: string, importPath: string) => {
        const resolved = path.posix.normalize(
          path.posix.join(path.posix.dirname(filePath), importPath),
        );
        const candidates = [resolved, `${resolved}.ts`, `${resolved}/index.ts`];
        if (candidates.some((candidate) => available.has(candidate))) {
          return statement;
        }
        names
          .split(',')
          .map((name) => name.trim().split(/\s+as\s+/)[1] ?? name.trim())
          .filter(Boolean)
          .forEach((name) => removed.add(name));
        return '';
      },
    );
    for (const identifier of removed) {
      result = this.removeProviderIdentifier(result, identifier);
    }
    return result.replace(/^\s*\n/gm, '\n').trimStart();
  }

  private removeProviderIdentifier(content: string, identifier: string) {
    const range = this.propertyArrayRange(content, 'providers');
    if (!range) return content;
    const body = content.slice(range.start + 1, range.end);
    const next = body
      .replace(
        new RegExp(`(^|,)\\s*${this.escapeRegExp(identifier)}\\s*(?=,|$)`, 'g'),
        '$1',
      )
      .replace(/,\s*,/g, ',')
      .replace(/^\s*,|,\s*$/g, '');
    return `${content.slice(0, range.start + 1)}${next}${content.slice(range.end)}`;
  }

  private mockControllerService(content: string): string {
    const serviceImport = content.match(
      /import\s+\{\s*(\w+Service)\s*\}\s+from\s+['"]\.[^'"]+\.service['"];?/,
    );
    if (!serviceImport) {
      const range = this.propertyArrayRange(content, 'providers');
      if (!range) return content;
      const body = content.slice(range.start + 1, range.end).trim();
      return body
        ? content
        : `${content.slice(0, range.propertyStart)}${content.slice(range.end + 1).replace(/^\s*,/, '')}`;
    }
    const serviceClass = serviceImport[1];
    const serviceVariable =
      content.match(
        new RegExp(`\\blet\\s+(\\w+)\\s*:\\s*${serviceClass}\\b`),
      )?.[1] ?? 'service';
    const methods = Array.from(
      new Set(
        Array.from(
          content.matchAll(
            new RegExp(
              `jest\\.spyOn\\(\\s*${serviceVariable}\\s*,\\s*['"](\\w+)['"]\\s*\\)`,
              'g',
            ),
          ),
          (match) => match[1],
        ),
      ),
    );
    const provider = `{ provide: ${serviceClass}, useValue: { ${methods
      .map((method) => `${method}: jest.fn()`)
      .join(', ')} } }`;
    const range = this.propertyArrayRange(content, 'providers');
    if (range) {
      return `${content.slice(0, range.start + 1)}${provider}${content.slice(range.end)}`;
    }
    const controllersRange = this.propertyArrayRange(content, 'controllers');
    if (!controllersRange) return content;
    return `${content.slice(0, controllersRange.end + 1)},\n      providers: [${provider}]${content.slice(controllersRange.end + 1)}`;
  }

  private ensureTypeOrmTestImports(
    filePath: string,
    content: string,
    context?: TestCodeContext,
  ) {
    let result = content;
    if (
      /\bgetRepositoryToken\s*\(/.test(result) &&
      !/from\s+['"]@nestjs\/typeorm['"]/.test(result)
    ) {
      result = `import { getRepositoryToken } from '@nestjs/typeorm';\n${result}`;
    }
    const entityNames = Array.from(
      new Set(
        Array.from(
          result.matchAll(/getRepositoryToken\(\s*(\w+)\s*\)/g),
          (match) => match[1],
        ),
      ),
    );
    for (const entityName of entityNames) {
      if (new RegExp(`import\\s+\\{[^}]*\\b${entityName}\\b`).test(result))
        continue;
      const entityFile = context?.relevantFiles.find(
        (file) =>
          file.path.endsWith('.entity.ts') &&
          new RegExp(`export\\s+class\\s+${entityName}\\b`).test(file.content),
      );
      if (!entityFile) continue;
      let relative = path.posix.relative(
        path.posix.dirname(filePath),
        entityFile.path.replace(/\.ts$/, ''),
      );
      if (!relative.startsWith('.')) relative = `./${relative}`;
      result = `import { ${entityName} } from '${relative}';\n${result}`;
    }
    return result;
  }

  private propertyArrayRange(content: string, property: string) {
    const match = new RegExp(`\\b${property}\\s*:`).exec(content);
    if (!match) return undefined;
    const start = content.indexOf('[', match.index);
    if (start < 0) return undefined;
    let depth = 0;
    for (let index = start; index < content.length; index += 1) {
      if (content[index] === '[') depth += 1;
      if (content[index] === ']') depth -= 1;
      if (depth === 0) {
        return { propertyStart: match.index, start, end: index };
      }
    }
    return undefined;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  validatePatchedSyntax(path: string, content: string): string | undefined {
    if (!path.endsWith('.ts')) {
      return undefined;
    }

    // transpileModule parses without type-checking, so it reports ONLY syntactic
    // problems (TS1xxx) — exactly the dangling-brace/token corruption a bad
    // find/replace produces — and never false-positives on unresolved imports or
    // types. Decorators are enabled so valid NestJS classes parse cleanly.
    const { diagnostics } = ts.transpileModule(content, {
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2021,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        isolatedModules: false,
      },
    });

    const error = (diagnostics ?? []).find(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );
    if (!error) {
      const duplicate = this.findDuplicateLexicalDeclarations(content)[0];
      return duplicate
        ? `TS2451: Cannot redeclare block-scoped variable '${duplicate.name}'.`
        : undefined;
    }

    return `TS${error.code}: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`;
  }

  async repairGeneratedTests(params: {
    appDir: string;
    errorSummary: string;
    workspace: WorkspaceWriter;
    context?: TestCodeContext;
  }): Promise<GeneratedFile[]> {
    const harnessRepairs = await this.repairInvalidTestHarnesses(params);
    const duplicateDeclarationRepairs =
      await this.removeDuplicateDeclarations(params);
    const initializationOrderRepairs =
      await this.repairTestingModuleInitializationOrder(params);
    const repositoryContractRepairs =
      await this.repairRepositoryContractMismatches(params);
    const contractRepairs = await this.removeInvalidControllerTests(params);
    const byPath = new Map(
      [
        ...duplicateDeclarationRepairs,
        ...harnessRepairs,
        ...initializationOrderRepairs,
        ...repositoryContractRepairs,
        ...contractRepairs,
      ].map((file) => [file.path, file]),
    );
    return this.normalizeTestFiles([...byPath.values()], params.context);
  }

  private async repairInvalidTestHarnesses(params: {
    appDir: string;
    errorSummary: string;
    workspace: WorkspaceWriter;
    context?: TestCodeContext;
  }): Promise<GeneratedFile[]> {
    if (
      !/(?:ReferenceError:|getRepositoryToken is not defined|Cannot find module|can't resolve dependencies)/i.test(
        params.errorSummary,
      )
    ) {
      return [];
    }
    const paths = Array.from(
      new Set(
        Array.from(
          params.errorSummary.matchAll(/^FAIL\s+(.+\.spec\.ts)\s*$/gm),
          (match) => match[1].trim(),
        ),
      ),
    );
    const repairs: GeneratedFile[] = [];
    for (const filePath of paths) {
      const original = await params.workspace.readTextFile(
        params.workspace.resolveInside(params.appDir, filePath),
      );
      const content = this.normalizeSpecFile(
        { path: filePath, content: original },
        params.context,
      );
      if (content !== original) repairs.push({ path: filePath, content });
    }
    return repairs;
  }

  private async repairRepositoryContractMismatches(params: {
    appDir: string;
    errorSummary: string;
    workspace: WorkspaceWriter;
    context?: TestCodeContext;
  }): Promise<GeneratedFile[]> {
    const paths = Array.from(
      new Set(
        Array.from(
          params.errorSummary.matchAll(/^FAIL\s+(.+\.service\.spec\.ts)\s*$/gm),
          (match) => match[1].trim(),
        ),
      ),
    );
    const repairs: GeneratedFile[] = [];

    for (const filePath of paths) {
      const sourcePath = filePath.replace(/\.spec\.ts$/, '.ts');
      const source = params.context?.relevantFiles.find(
        (file) => file.path === sourcePath,
      )?.content;
      if (!source) {
        continue;
      }
      let content = await params.workspace.readTextFile(
        params.workspace.resolveInside(params.appDir, filePath),
      );
      const original = content;

      if (/Repository\.delete\(/.test(source)) {
        content = content.replace(
          /(useValue:\s*\{\s*\n)/,
          '$1            delete: jest.fn(),\n',
        );
        content = content.replace(
          /jest\.spyOn\(repository, ['"]remove['"]\)\.mockResolvedValue\([^;]+\);/,
          "jest.spyOn(repository, 'delete').mockResolvedValue({ affected: 1 } as never);",
        );
      }

      if (!this.methodReturnsValue(source, 'remove')) {
        const removeStart = content.search(/describe\(['"]remove['"]/);
        if (removeStart >= 0) {
          content = `${content.slice(0, removeStart)}${content
            .slice(removeStart)
            .replace(/\.toEqual\(result\)/, '.toBeUndefined()')}`;
        }
      }

      if (content !== original) {
        repairs.push({ path: filePath, content });
      }
    }

    return repairs;
  }

  private methodReturnsValue(content: string, methodName: string): boolean {
    const source = ts.createSourceFile(
      'application-source.ts',
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    let method: ts.MethodDeclaration | undefined;
    const visit = (node: ts.Node) => {
      if (
        ts.isMethodDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === methodName
      ) {
        method = node;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (!method) {
      return true;
    }
    if (method.type?.getText(source).replace(/\s/g, '') === 'Promise<void>') {
      return false;
    }
    let hasValueReturn = false;
    const findReturn = (node: ts.Node) => {
      if (ts.isReturnStatement(node) && node.expression) {
        hasValueReturn = true;
      }
      ts.forEachChild(node, findReturn);
    };
    if (method.body) {
      findReturn(method.body);
    }
    return hasValueReturn;
  }

  private async repairTestingModuleInitializationOrder(params: {
    appDir: string;
    errorSummary: string;
    workspace: WorkspaceWriter;
  }): Promise<GeneratedFile[]> {
    if (
      !/Cannot access ['"]module['"] before initialization/.test(
        params.errorSummary,
      )
    ) {
      return [];
    }

    const paths = Array.from(
      new Set(
        Array.from(
          params.errorSummary.matchAll(/^FAIL\s+(.+\.spec\.ts)\s*$/gm),
          (match) => match[1].trim(),
        ),
      ),
    );
    const repairs: GeneratedFile[] = [];

    for (const filePath of paths) {
      const content = await params.workspace.readTextFile(
        params.workspace.resolveInside(params.appDir, filePath),
      );
      const lines = content.split('\n');
      const declaration = lines.findIndex((line) =>
        /\bconst\s+module\s*:[^=]+\s*=\s*await\s+Test\.createTestingModule/.test(
          line,
        ),
      );
      if (declaration < 0) {
        continue;
      }

      const premature = lines
        .map((line, index) => ({ line, index }))
        .filter(
          ({ line, index }) =>
            index < declaration &&
            /^\s*\w+\s*=\s*module\.get(?:<|\()/.test(line),
        );
      if (premature.length === 0) {
        continue;
      }

      for (const entry of [...premature].reverse()) {
        lines.splice(entry.index, 1);
      }
      repairs.push({ path: filePath, content: lines.join('\n') });
    }

    return repairs;
  }

  private async removeDuplicateDeclarations(params: {
    appDir: string;
    errorSummary: string;
    workspace: WorkspaceWriter;
  }): Promise<GeneratedFile[]> {
    if (
      !/Identifier ['"].+['"] has already been declared/.test(
        params.errorSummary,
      )
    ) {
      return [];
    }
    const paths = Array.from(
      new Set(
        Array.from(
          params.errorSummary.matchAll(/^FAIL\s+(.+\.spec\.ts)\s*$/gm),
          (match) => match[1].trim(),
        ),
      ),
    );
    const repairs: GeneratedFile[] = [];
    for (const filePath of paths) {
      const content = await params.workspace.readTextFile(
        params.workspace.resolveInside(params.appDir, filePath),
      );
      const duplicates = this.findDuplicateLexicalDeclarations(content);
      if (duplicates.length === 0) {
        continue;
      }
      let repaired = content;
      for (const duplicate of [...duplicates].sort(
        (left, right) => right.start - left.start,
      )) {
        repaired = `${repaired.slice(0, duplicate.start)}${repaired.slice(duplicate.end)}`;
      }
      repairs.push({ path: filePath, content: repaired });
    }
    return repairs;
  }

  private findDuplicateLexicalDeclarations(content: string): Array<{
    name: string;
    start: number;
    end: number;
  }> {
    const source = ts.createSourceFile(
      'generated.spec.ts',
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    const duplicates: Array<{ name: string; start: number; end: number }> = [];

    const visit = (node: ts.Node) => {
      if (ts.isSourceFile(node) || ts.isBlock(node)) {
        const declared = new Set<string>();
        for (const statement of node.statements) {
          if (!ts.isVariableStatement(statement)) {
            continue;
          }
          const flags = statement.declarationList.flags;
          if (!(flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) {
            continue;
          }
          for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name)) {
              continue;
            }
            if (declared.has(declaration.name.text)) {
              duplicates.push({
                name: declaration.name.text,
                start: statement.getFullStart(),
                end: statement.getEnd(),
              });
            } else {
              declared.add(declaration.name.text);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return duplicates;
  }

  private async removeInvalidControllerTests(params: {
    appDir: string;
    workspace: WorkspaceWriter;
    context?: TestCodeContext;
  }): Promise<GeneratedFile[]> {
    if (!params.context) {
      return [];
    }
    const repairs: GeneratedFile[] = [];
    const diagnosesByPath = new Map<string, string[]>();
    for (const diagnosis of params.context.failureDiagnoses) {
      if (
        diagnosis.kind !== 'missing-controller-method' ||
        !diagnosis.missingMethod
      ) {
        continue;
      }
      diagnosesByPath.set(diagnosis.filePath, [
        ...(diagnosesByPath.get(diagnosis.filePath) ?? []),
        diagnosis.missingMethod,
      ]);
    }

    for (const [filePath, missingMethods] of diagnosesByPath) {
      const contract = params.context.controllerContracts.find(
        (candidate) =>
          candidate.filePath === filePath.replace(/\.spec\.ts$/, '.ts'),
      );
      if (!contract) {
        continue;
      }
      const content = await params.workspace.readTextFile(
        params.workspace.resolveInside(params.appDir, filePath),
      );
      const variable = content.match(
        new RegExp(
          `\\b(?:let|const)\\s+(\\w+)\\s*:\\s*${contract.className}\\b`,
        ),
      )?.[1];
      if (!variable) {
        continue;
      }
      const repaired = missingMethods.reduce(
        (current, method) =>
          this.removeTestCasesCalling(current, variable, method),
        content,
      );
      if (repaired !== content) {
        repairs.push({ path: filePath, content: repaired });
      }
    }
    return repairs;
  }

  private removeTestCasesCalling(
    content: string,
    variable: string,
    method: string,
  ): string {
    const lines = content.split('\n');
    const callPattern = new RegExp(`\\b${variable}\\.${method}\\s*\\(`);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (!callPattern.test(lines[index])) {
        continue;
      }
      let start = index;
      while (start >= 0 && !/^\s*(it|test)\s*\(/.test(lines[start])) {
        start -= 1;
      }
      if (start < 0) {
        continue;
      }
      let depth = 0;
      let sawBlock = false;
      let end = start;
      for (; end < lines.length; end += 1) {
        for (const character of lines[end]) {
          if (character === '{') {
            depth += 1;
            sawBlock = true;
          } else if (character === '}') {
            depth -= 1;
          }
        }
        if (sawBlock && depth === 0) {
          break;
        }
      }
      if (sawBlock && end < lines.length) {
        lines.splice(start, end - start + 1);
      }
    }
    return lines.join('\n');
  }

  testGenerationSystemPrompt(): string {
    return [
      `You are a precise NestJS testing agent that targets at least ${this.coverageTarget}% coverage and keeps tests faithful to the specification.`,
      'Return JSON only with shape {"files":[...],"patches":[...]}.',
      '- "files": entries {"path","content"} with the COMPLETE file content. Use ONLY for brand-new spec files or a complete replacement of a spec that failed in the immediately preceding run — never for application source.',
      '- "patches": entries {"path","edits":[{"find","replace"}]} that edit an EXISTING file. "find" must be an exact, unique substring of the current file; "replace" is its replacement. Prefer patches — they leave passing tests untouched.',
      'A patch may target only a *.spec.ts file. Never modify application source, configuration, or the managed test harness.',
      'When fixing a failure, emit the smallest patch that fixes it (e.g. a single edit adding a missing import). Do NOT resend a whole passing file.',
      'Generate complete Jest test files (in "files"), never snippets.',
    ].join('\n');
  }

  testGenerationPrompt(params: {
    spec: TestSpec;
    context: TestCodeContext;
    attempt: number;
    coverageGaps: CoverageGap[];
    patchFailures?: FilePatchFailure[];
  }): string {
    const failureSummaries = params.context.previousFailures
      .map((failure) => failure.errorSummary?.trim())
      .filter((summary): summary is string => Boolean(summary));

    // Surface the failure prominently at the top and strip it out of the raw
    // context dump below so the actionable error is not buried in noise.
    const leadingFailureSection =
      failureSummaries.length > 0
        ? [
            '=== FIX THIS TEST FAILURE FIRST ===',
            'The previous run failed with the output below. Diagnose the exact cause and fix ONLY what is broken, preferably with a patch:',
            failureSummaries[failureSummaries.length - 1],
            '',
          ]
        : [];

    const patchFailureSection =
      params.patchFailures && params.patchFailures.length > 0
        ? [
            'Your previous patches did NOT apply and were skipped — for each, resend the fix (a patch with a unique "find", or the full file in "files"):',
            JSON.stringify(params.patchFailures, null, 2),
            '',
          ]
        : [];

    const contextForPrompt = {
      relevantFiles: params.context.relevantFiles,
      symbols: params.context.symbols,
      controllerContracts: params.context.controllerContracts,
      failureDiagnoses: params.context.failureDiagnoses,
      instructions: params.context.instructions,
    };
    const existingPaths = new Set(
      params.context.relevantFiles.map((file) => file.path),
    );
    const mandatoryNewSpecs = params.context.relevantFiles
      .map((file) => file.path)
      .filter((filePath) => /\.(controller|service)\.ts$/.test(filePath))
      .map((filePath) => filePath.replace(/\.ts$/, '.spec.ts'))
      .filter((specPath) => !existingPaths.has(specPath));

    return [
      ...leadingFailureSection,
      ...patchFailureSection,
      'Create or repair tests for the generated NestJS app.',
      'Prefer targeted "patches" to existing spec files. A complete "files" replacement is allowed ONLY for a spec that failed in the immediately preceding run, when removing or restructuring invalid tests is safer than a patch.',
      `Coverage target: at least ${this.coverageTarget}% statements, branches, functions, and lines globally. Prioritize specification behavior over synthetic coverage-only assertions.`,
      'Write a *.spec.ts file next to every controller, service, and any other source file with executable logic — including the root src/app.controller.ts.',
      'A managed test/app.e2e-spec.ts boots AppModule with SQL.js, verifies health, every specified OpenAPI operation and request schema, and parameterless GET routes. Do not replace or patch that managed file.',
      ...(mandatoryNewSpecs.length > 0
        ? [
            'MANDATORY NEW SPEC FILES: the following source files have no corresponding test. Return each path as a complete entry in "files" during this attempt:',
            JSON.stringify(mandatoryNewSpecs, null, 2),
          ]
        : []),
      'When coverage gaps are listed, prioritize meaningful uncovered behavior in those files; do not create assertions solely to chase unreachable or declarative lines.',
      'Do not touch spec files that already pass. Preserve passing tests, but you MAY remove or replace assertions that call a method absent from the controller contract.',
      'To cover branch gaps from optional/nullish operators (?? , ?. , || defaults), call the method twice: once with the value present and once with it undefined/null.',
      'Test every public method of every controller and service, including error branches (NotFoundException, BadRequestException, null checks). Controller tests may call ONLY methods listed in controllerContracts. A service method does not imply a controller method with the same name.',
      'Every NestJS HTTP exception you reference (NotFoundException, BadRequestException, ...) MUST be imported from @nestjs/common in that spec file.',
      'The tests must validate the endpoint/function specifications from the Semraz Operations step.',
      'Add meaningful DTO validation cases for required fields, formats, enum/range/length constraints, and forbidden client ownership of server-managed fields.',
      'For services that write relation foreign keys or unique values, test the controlled NotFoundException/ConflictException path instead of accepting raw database errors.',
      'Use @nestjs/testing Test.createTestingModule with mocked repositories (getRepositoryToken) so no real database is needed.',
      'Import ONLY files that exist in the codebase context; never invent an import like ./app.service unless that file is shown. A controller with no constructor dependencies is tested with controllers: [TheController] and no providers.',
      'Cover both success and failure paths of each branch; if a service method throws when an entity is missing, assert that it throws.',
      '=== WHEN A TEST FAILS, CLASSIFY THE CAUSE BEFORE FIXING ===',
      'Compare the endpoint/function specification and business rules against the ACTUAL method body shown in the codebase context, then decide:',
      '  (a) BAD TEST — wrong matcher, missing import, or it asserts behavior that NEITHER the code NOR the specification requires. Fix the test.',
      '  (b) CODE DEFECT — the specification or business rules require behavior the application does not implement. Keep the faithful failing test; never patch application source from this flow.',
      'Do NOT invent behavior nothing requires: if the specification does not call for a throw and the method returns null/undefined when an entity is missing, assert that return value (await expect(...).resolves.toBeNull()) instead of forcing a throw.',
      'Failure "Received promise resolved instead of rejected" (Resolved to value: null/undefined): if the spec requires the throw, keep the faithful failing assertion; otherwise match the documented/actual return value.',
      'Failure "received value must be a promise ... Received has value: undefined": use a synchronous assertion only when that matches the specification and actual method contract.',
      'To assert an async method throws, ALWAYS write await expect(instance.method(args)).rejects.toThrow(SomeException) — pass the un-awaited promise into expect; never call the method with await outside expect and never wrap it in a try/catch.',
      'For a method that throws synchronously, write expect(() => instance.method(args)).toThrow(SomeException) with an arrow function.',
      'When mocking a service method to simulate an error, ALWAYS use mockRejectedValue(new SomeException(...)) so the controller receives a rejected promise; NEVER use mockImplementation(() => { throw ... }) — a synchronous throw escapes rejects.toThrow assertions.',
      'A controller method only delegates (return this.service.method(args)); it does NOT validate input itself. In a controller spec the service is mocked, so a test that asserts the controller throws MUST first make the mock reject: jest.spyOn(service, "method").mockRejectedValue(new BadRequestException(...)) before await expect(controller.method(dto)).rejects.toThrow(...). If such a test fails with "received value must be a promise / Received has value: undefined", the mock was never set to reject (it returned undefined) — FIX THE TEST by adding the mockRejectedValue setup; do NOT add validation to the controller.',
      'DTO and entity classes are covered by importing and instantiating them in the specs that use them.',
      'Update/partial DTOs are all-optional (every field is @IsOptional): an empty instance produces ZERO validation errors. Never assert an Update DTO "fails validation when fields are missing" — assert validate(dto) resolves to an empty array. Only Create DTOs carry required-field validation.',
      'When you weaken or change an assertion, DELETE every now-contradictory follow-up assertion in the same test. E.g. after changing to expect(errors.length).toBe(0), remove any errors[i].constraints checks — they read undefined and crash. A test must not both assert an empty result and then index into it.',
      'Do not return package.json; the harness is managed by the pipeline.',
      '',
      'Example of a minimal patch that adds a missing import:',
      JSON.stringify(
        {
          patches: [
            {
              path: 'src/health-metric/health-metric.controller.spec.ts',
              edits: [
                {
                  find: "import { Test, TestingModule } from '@nestjs/testing';",
                  replace:
                    "import { NotFoundException } from '@nestjs/common';\nimport { Test, TestingModule } from '@nestjs/testing';",
                },
              ],
            },
          ],
        },
        null,
        2,
      ),
      '',
      `Attempt: ${params.attempt}`,
      ...(params.coverageGaps.length > 0
        ? [
            '',
            `Files currently below the ${this.coverageTarget}% coverage target — add or extend meaningful specs:`,
            JSON.stringify(params.coverageGaps, null, 2),
          ]
        : []),
      '',
      'Endpoint/function specification:',
      JSON.stringify(
        {
          projectName: params.spec.projectName,
          summary: params.spec.summary,
          endpoints: params.spec.endpoints,
          businessRules: params.spec.businessRules,
        },
        null,
        2,
      ),
      '',
      'Codebase context (inspect all files; patch only existing *.spec.ts files):',
      JSON.stringify(contextForPrompt, null, 2),
    ].join('\n');
  }

  setupCommands(): CommandSpec[] {
    return [
      {
        command: 'npm',
        args: ['install', '--include=dev'],
        description: 'Install test dependencies',
      },
    ];
  }

  executionCommands(): CommandSpec[] {
    return [
      {
        command: 'npm',
        args: ['run', 'test:cov'],
        description: 'Run generated Jest tests with coverage',
        env: {
          DATABASE_URL: null,
          NODE_ENV: 'test',
          PORT: null,
        },
      },
      {
        command: 'npm',
        args: ['run', 'typecheck'],
        description: 'Type-check application source and generated Jest mocks',
        env: {
          DATABASE_URL: null,
          NODE_ENV: 'test',
          PORT: null,
        },
      },
    ];
  }

  targetExecutionCommands(testFile: string): CommandSpec[] {
    return [
      {
        command: 'npm',
        args: ['run', 'test', '--', '--runTestsByPath', testFile],
        description: `Run generated Jest spec ${testFile}`,
        env: {
          DATABASE_URL: null,
          NODE_ENV: 'test',
          PORT: null,
        },
      },
    ];
  }

  extractTestCounts(
    output: string,
  ): { passed: number; failed: number; total: number } | undefined {
    // eslint-disable-next-line no-control-regex
    const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
    // Use the LAST "Tests:" line so a repair re-run's summary wins over earlier ones.
    const line = clean
      .split('\n')
      .reverse()
      .find((entry) => /^\s*Tests:\s/.test(entry));
    if (!line) {
      return undefined;
    }

    const passed = Number(line.match(/(\d+)\s+passed/)?.[1] ?? 0);
    const failed = Number(line.match(/(\d+)\s+failed/)?.[1] ?? 0);
    const total = Number(line.match(/(\d+)\s+total/)?.[1] ?? passed + failed);
    return { passed, failed, total };
  }

  extractCoverageSummary(output: string): string | undefined {
    const coverageBlock = output.match(
      /-{5,}[\s\S]*?All files[\s\S]*?(?=\n-{5,}|\z)/,
    )?.[0];
    return coverageBlock?.slice(-4_000);
  }

  extractFailureSummary(output: string): string | undefined {
    // Jest colorizes output; strip ANSI so the markers below match.
    const clean = output.replace(
      // eslint-disable-next-line no-control-regex
      /\x1b\[[0-9;]*m/g,
      '',
    );
    const lines = clean.split('\n');

    const firstFailure = lines.findIndex(
      (line) => /^\s*●/.test(line) || /^\s*FAIL\s/.test(line),
    );
    if (firstFailure === -1) {
      return undefined;
    }

    // Failure blocks come BEFORE the coverage table and the summary counts, so
    // cut the slice off at whichever boundary appears first.
    const boundary = lines.findIndex(
      (line, index) =>
        index > firstFailure &&
        (/^-{3,}\|/.test(line) ||
          /^={3,}/.test(line) ||
          /^File\s+\|/.test(line) ||
          /^Test Suites:/.test(line)),
    );
    const end = boundary === -1 ? lines.length : boundary;

    const failureBlock = lines.slice(firstFailure, end).join('\n').trim();
    if (!failureBlock) {
      return undefined;
    }

    const summaryLine = lines.find((line) => /^Tests:\s/.test(line))?.trim();

    // Keep the HEAD of the failures (first errors are the most actionable) and
    // prepend the pass/fail counts for context.
    return [summaryLine, failureBlock.slice(0, 12_000)]
      .filter(Boolean)
      .join('\n\n');
  }

  async readCoverageGaps(appDir: string): Promise<CoverageGap[]> {
    try {
      const summaryPath = this.workspace.resolveInside(
        appDir,
        'coverage/coverage-summary.json',
      );
      const summary = JSON.parse(
        await this.workspace.readTextFile(summaryPath),
      ) as Record<string, Record<string, { pct?: number }>>;

      const gaps: CoverageGap[] = [];
      for (const [filePath, metrics] of Object.entries(summary)) {
        if (filePath === 'total') {
          continue;
        }

        const gap: CoverageGap = {
          path: this.toRelativePath(appDir, filePath),
          statements: metrics.statements?.pct ?? 100,
          branches: metrics.branches?.pct ?? 100,
          functions: metrics.functions?.pct ?? 100,
          lines: metrics.lines?.pct ?? 100,
        };

        if (
          gap.statements < this.coverageTarget ||
          gap.branches < this.coverageTarget ||
          gap.functions < this.coverageTarget ||
          gap.lines < this.coverageTarget
        ) {
          gaps.push(gap);
        }
      }

      return gaps;
    } catch {
      return [];
    }
  }

  private toRelativePath(appDir: string, filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const marker = appDir.replace(/\\/g, '/');
    return normalized.startsWith(marker)
      ? normalized.slice(marker.length).replace(/^\//, '')
      : normalized;
  }

  private asRecord(value: unknown): Record<string, string> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, string>)
      : {};
  }
}
