import { Injectable } from '@nestjs/common';
import * as ts from 'typescript';
import { FileSearchTool } from '../../tools/file-search.tool';
import { WorkspaceWriter } from '../../builds/runtime/workspace-writer';
import { TypeScriptLanguageAdapter } from '../../builds/languages/typescript-language.adapter';
import { BuildRunResult } from '../../builds/types/build.types';
import {
  ControllerContract,
  TestCodeContext,
  TestFailureDiagnosis,
  TestSpec,
} from '../types/test.types';

@Injectable()
export class TestCodebaseSearchAgent {
  constructor(
    private readonly fileSearch: FileSearchTool,
    private readonly workspace: WorkspaceWriter,
    private readonly language: TypeScriptLanguageAdapter,
  ) {}

  async search(params: {
    appDir: string;
    spec: TestSpec;
    previousFailures: BuildRunResult[];
  }): Promise<TestCodeContext> {
    const hints = this.contextHints(params.spec);
    const hintedFiles = await this.fileSearch.search(params.appDir, {
      extensions: ['.ts', '.json'],
      hints,
    });
    const sourceFiles = await this.fileSearch.search(params.appDir, {
      extensions: this.language.sourceExtensions,
    });
    const configFiles = await this.fileSearch.search(params.appDir, {
      extensions: this.language.configExtensions,
      hints: ['package', 'tsconfig', 'nest-cli'],
    });
    const controllerContracts = await this.extractControllerContracts(
      params.appDir,
      sourceFiles,
    );
    const reportedFailedSpecPaths = this.failedSpecPaths(
      params.previousFailures,
    );
    const contractViolations = await this.findContractViolations(
      params.appDir,
      sourceFiles,
      controllerContracts,
    );
    const failedSpecPaths = Array.from(
      new Set([
        ...reportedFailedSpecPaths,
        ...contractViolations.map((violation) => violation.filePath),
      ]),
    );
    const failureDiagnoses = [
      ...contractViolations,
      ...this.diagnoseFailures(
        params.previousFailures,
        reportedFailedSpecPaths,
        controllerContracts,
      ),
    ];
    const relevantFilePaths = this.prioritizeFiles(
      hintedFiles,
      sourceFiles,
      configFiles,
      failedSpecPaths,
    );
    const symbols = await this.language.searchSymbols(
      params.appDir,
      sourceFiles,
    );
    const relevantFiles = await Promise.all(
      relevantFilePaths.map(async (filePath) => ({
        path: filePath,
        content: await this.readBounded(params.appDir, filePath),
      })),
    );

    return {
      relevantFiles,
      symbols: symbols.filter((symbol) =>
        hints.some((hint) => {
          const normalizedHint = hint.toLowerCase();
          return (
            symbol.filePath.toLowerCase().includes(normalizedHint) ||
            symbol.name.toLowerCase().includes(normalizedHint) ||
            symbol.decorators.some((decorator) =>
              decorator.toLowerCase().includes(normalizedHint),
            )
          );
        }),
      ),
      previousFailures: params.previousFailures,
      controllerContracts,
      failureDiagnoses,
      failedSpecPaths,
      instructions: [
        'Generate tests against the existing generated NestJS codebase.',
        'Use isolated controller/service tests for branch detail and the managed Supertest E2E suite for real module, pipe, route, database, and OpenAPI integration.',
        'Treat an app that cannot compile in-memory with DATABASE_URL removed as a product defect, not a reason to skip E2E coverage.',
        'Validate DTO constraints, relation failures, and documented uniqueness/range rules with realistic inputs.',
        'Never modify application source while generating tests. Report product-code defects through failing tests instead.',
      ],
    };
  }

  private contextHints(spec: TestSpec) {
    const endpointHints = spec.endpoints.flatMap((endpoint) => [
      endpoint.entityName,
      endpoint.operationName,
      endpoint.path,
      this.toKebabCase(endpoint.entityName),
      this.toPascalCase(endpoint.entityName),
      'controller',
      'service',
      'dto',
      'module',
    ]);

    return Array.from(
      new Set(
        ['app.module', 'main', 'package', ...endpointHints]
          .map((hint) => hint.toLowerCase().replace(/[^a-z0-9._/-]/g, ''))
          .filter(Boolean),
      ),
    );
  }

  private prioritizeFiles(
    hintedFiles: string[],
    sourceFiles: string[],
    configFiles: string[],
    failedSpecPaths: string[],
  ) {
    const failureSources = failedSpecPaths
      .map((filePath) => filePath.replace(/\.spec\.ts$/, '.ts'))
      .filter((filePath) => sourceFiles.includes(filePath));

    return Array.from(
      new Set([
        ...failedSpecPaths,
        ...failureSources,
        ...configFiles,
        // Existing specs come first so the LLM extends them instead of
        // blindly overwriting earlier attempts with fewer tests.
        ...sourceFiles.filter((file) => file.endsWith('.spec.ts')),
        ...hintedFiles,
        ...sourceFiles.filter((file) =>
          /(\.controller|\.service|\.module|\.dto|\.entity|main|app\.module)\.ts$/.test(
            file,
          ),
        ),
        ...sourceFiles.slice(0, 20),
      ]),
    )
      .filter(
        (file) => !file.includes('/dist/') && !file.includes('/coverage/'),
      )
      .slice(0, 50)
      .sort();
  }

  private async extractControllerContracts(
    rootDir: string,
    sourceFiles: string[],
  ): Promise<ControllerContract[]> {
    const controllerFiles = sourceFiles.filter((filePath) =>
      filePath.endsWith('.controller.ts'),
    );
    const contracts: Array<ControllerContract | undefined> = await Promise.all(
      controllerFiles.map(async (filePath) => {
        const content = await this.workspace.readTextFile(
          this.workspace.resolveInside(rootDir, filePath),
        );
        const source = ts.createSourceFile(
          filePath,
          content,
          ts.ScriptTarget.Latest,
          true,
        );
        const controller = source.statements.find(
          (statement): statement is ts.ClassDeclaration =>
            ts.isClassDeclaration(statement) &&
            this.decoratorName(statement) === 'Controller',
        );
        if (!controller?.name) {
          return undefined;
        }
        return {
          className: controller.name.text,
          filePath,
          ...(this.decoratorArgument(controller)
            ? { basePath: this.decoratorArgument(controller) }
            : {}),
          methods: controller.members.flatMap((member) => {
            if (!ts.isMethodDeclaration(member) || !member.name) {
              return [];
            }
            const name = ts.isIdentifier(member.name)
              ? member.name.text
              : member.name.getText(source);
            const decorator = this.decoratorName(member);
            return [
              {
                name,
                httpMethod: ['Get', 'Post', 'Put', 'Patch', 'Delete'].includes(
                  decorator ?? '',
                )
                  ? decorator?.toUpperCase()
                  : undefined,
                path: this.decoratorArgument(member),
              },
            ];
          }),
        } satisfies ControllerContract;
      }),
    );
    return contracts.filter((contract): contract is ControllerContract =>
      Boolean(contract),
    );
  }

  private decoratorName(node: ts.HasDecorators): string | undefined {
    const decorator = ts.getDecorators(node)?.[0];
    if (!decorator) {
      return undefined;
    }
    const expression = decorator.expression;
    if (ts.isCallExpression(expression)) {
      return ts.isIdentifier(expression.expression)
        ? expression.expression.text
        : undefined;
    }
    return ts.isIdentifier(expression) ? expression.text : undefined;
  }

  private decoratorArgument(node: ts.HasDecorators): string | undefined {
    const decorator = ts.getDecorators(node)?.[0];
    if (!decorator || !ts.isCallExpression(decorator.expression)) {
      return undefined;
    }
    const argument = decorator.expression.arguments[0];
    return argument && ts.isStringLiteral(argument) ? argument.text : undefined;
  }

  private failedSpecPaths(failures: BuildRunResult[]): string[] {
    return Array.from(
      new Set(
        failures.flatMap((failure) =>
          Array.from(
            failure.errorSummary?.matchAll(/^FAIL\s+(.+\.spec\.ts)\s*$/gm) ??
              [],
            (match) => match[1].trim(),
          ),
        ),
      ),
    );
  }

  private async findContractViolations(
    rootDir: string,
    sourceFiles: string[],
    contracts: ControllerContract[],
  ): Promise<TestFailureDiagnosis[]> {
    const specPaths = sourceFiles.filter((filePath) =>
      filePath.endsWith('.controller.spec.ts'),
    );
    const diagnoses = await Promise.all(
      specPaths.map(async (filePath) => {
        const contract = contracts.find(
          (candidate) =>
            candidate.filePath === filePath.replace(/\.spec\.ts$/, '.ts'),
        );
        if (!contract) {
          return [];
        }
        const content = await this.workspace.readTextFile(
          this.workspace.resolveInside(rootDir, filePath),
        );
        const variable = content.match(
          new RegExp(
            `\\b(?:let|const)\\s+(\\w+)\\s*:\\s*${contract.className}\\b`,
          ),
        )?.[1];
        if (!variable) {
          return [];
        }
        const knownMethods = new Set(
          contract.methods.map((method) => method.name),
        );
        const missingMethods = Array.from(
          new Set(
            Array.from(
              content.matchAll(
                new RegExp(`\\b${variable}\\.(\\w+)\\s*\\(`, 'g'),
              ),
              (match) => match[1],
            ).filter((method) => !knownMethods.has(method)),
          ),
        );
        return missingMethods.map((missingMethod) => ({
          filePath,
          kind: 'missing-controller-method' as const,
          message: `Bad test detected before execution: ${contract.className}.${missingMethod} does not exist. Replace or remove only the invalid assertions; do not modify application code.`,
          controllerClass: contract.className,
          missingMethod,
          availableMethods: contract.methods.map((method) => method.name),
        }));
      }),
    );
    return diagnoses.flat();
  }

  private diagnoseFailures(
    failures: BuildRunResult[],
    failedSpecPaths: string[],
    contracts: ControllerContract[],
  ): TestFailureDiagnosis[] {
    const summary = failures
      .map((failure) => failure.errorSummary ?? '')
      .join('\n');
    const missing = summary.match(/\b\w+\.(\w+) is not a function/);
    if (!missing) {
      return [];
    }

    return failedSpecPaths.flatMap((filePath) => {
      const folder = filePath.slice(0, filePath.lastIndexOf('/'));
      const contract =
        contracts.find(
          (candidate) =>
            candidate.filePath === filePath.replace(/\.spec\.ts$/, '.ts'),
        ) ??
        contracts.find((candidate) =>
          candidate.filePath.startsWith(`${folder}/`),
        );
      if (!contract) {
        return [];
      }
      return [
        {
          filePath,
          kind: 'missing-controller-method' as const,
          message: `Bad test: ${contract.className}.${missing[1]} does not exist. Replace or remove only the invalid assertions; do not modify application code.`,
          controllerClass: contract.className,
          missingMethod: missing[1],
          availableMethods: contract.methods.map((method) => method.name),
        },
      ];
    });
  }

  private async readBounded(rootDir: string, filePath: string) {
    const content = await this.workspace.readTextFile(
      this.workspace.resolveInside(rootDir, filePath),
    );
    return content.length > 12_000 ? content.slice(0, 12_000) : content;
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
}
