import { Injectable } from '@nestjs/common';
import ts from 'typescript';
import path from 'node:path';
import { CodeSymbol } from '../builds/types/build.types';
import { WorkspaceWriter } from '../builds/runtime/workspace-writer';

@Injectable()
export class AstSearchTool {
  constructor(private readonly workspace: WorkspaceWriter) {}

  async searchTypescriptSymbols(rootDir: string, files: string[]): Promise<CodeSymbol[]> {
    const symbols: CodeSymbol[] = [];

    for (const file of files.filter((candidate) => candidate.endsWith('.ts'))) {
      const absolutePath = this.workspace.resolveInside(rootDir, file);
      const sourceText = await this.workspace.readTextFile(absolutePath);
      const sourceFile = ts.createSourceFile(
        absolutePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
      );

      const visit = (node: ts.Node) => {
        if (
          ts.isClassDeclaration(node) ||
          ts.isMethodDeclaration(node) ||
          ts.isFunctionDeclaration(node) ||
          ts.isInterfaceDeclaration(node)
        ) {
          const name = this.nodeName(node);
          if (name) {
            symbols.push({
              filePath: path.relative(rootDir, absolutePath),
              kind: ts.SyntaxKind[node.kind],
              name,
              decorators: this.decoratorNames(node),
            });
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    }

    return symbols;
  }

  private nodeName(node: ts.Node) {
    const named = node as ts.Node & { name?: ts.Node };
    if (!named.name || !ts.isIdentifier(named.name)) {
      return undefined;
    }
    return named.name.text;
  }

  private decoratorNames(node: ts.Node) {
    const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
    return decorators
      .map((decorator) => {
        const expression = decorator.expression;
        if (ts.isCallExpression(expression)) {
          const callee = expression.expression;
          return ts.isIdentifier(callee) ? callee.text : undefined;
        }
        return ts.isIdentifier(expression) ? expression.text : undefined;
      })
      .filter((name): name is string => Boolean(name));
  }
}
