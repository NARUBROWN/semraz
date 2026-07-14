import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { WorkspaceWriter } from '../../builds/runtime/workspace-writer';
import { TestEndpointSpec, TestSpec } from '../types/test.types';

@Injectable()
export class EndpointSpecUnderstandingAgent {
  constructor(private readonly workspace: WorkspaceWriter) {}

  async understand(projectDir: string): Promise<TestSpec> {
    const docFiles = await this.workspace.listMarkdownFiles(projectDir);
    const sourceDocs = await Promise.all(
      docFiles.map(async (filePath) => ({
        path: filePath,
        content: await this.workspace.readTextFile(
          this.workspace.resolveInside(projectDir, filePath),
        ),
      })),
    );
    const docsByPath = new Map(
      sourceDocs.map((doc) => [
        path.basename(doc.path).toLowerCase(),
        doc.content,
      ]),
    );
    const projectDoc =
      docsByPath.get('project.md') ?? sourceDocs[0]?.content ?? '';
    const endpointsDoc = docsByPath.get('endpoints.md') ?? '';
    const rulesDoc = docsByPath.get('rules.md') ?? '';

    return {
      projectName:
        this.firstMarkdownHeading(projectDoc) ?? 'Generated NestJS App',
      summary: this.firstParagraphAfterHeading(projectDoc) ?? '',
      endpoints: this.parseEndpointRows(endpointsDoc),
      businessRules: this.parseBulletRows(rulesDoc),
      sourceDocs,
    };
  }

  private parseEndpointRows(endpointsDoc: string): TestEndpointSpec[] {
    const endpoints: TestEndpointSpec[] = [];
    let entityName = '';
    let operationName = '';
    let currentEndpoint: TestEndpointSpec | undefined;
    let detailSection: 'requestFields' | 'responseFields' | undefined;

    for (const rawLine of endpointsDoc.split('\n')) {
      const line = rawLine.trim();
      const sectionHeading = line.match(/^##\s+(?:Entity:\s*)?(.+?)\s*#*$/i);
      if (sectionHeading) {
        entityName = sectionHeading[1].trim();
        currentEndpoint = undefined;
        detailSection = undefined;
        continue;
      }

      const operationHeading = line.match(/^###\s+(.+?)\s*#*$/);
      if (operationHeading) {
        const headingText = operationHeading[1].trim();
        const inlineEndpoint = this.parseEndpointDeclaration(headingText);
        if (inlineEndpoint) {
          operationName = headingText;
          currentEndpoint = this.newEndpoint(
            entityName,
            operationName,
            inlineEndpoint,
          );
          endpoints.push(currentEndpoint);
        } else {
          operationName = headingText;
          currentEndpoint = undefined;
        }
        detailSection = undefined;
        continue;
      }

      if (/^####\s+(Request Fields|Request|Inputs?)\s*#*$/i.test(line)) {
        detailSection = 'requestFields';
        continue;
      }

      if (/^####\s+(Response Fields|Response|Outputs?)\s*#*$/i.test(line)) {
        detailSection = 'responseFields';
        continue;
      }

      if (/^####\s+/.test(line)) {
        detailSection = undefined;
        continue;
      }

      const endpoint = this.parseEndpointDeclaration(line);
      if (endpoint) {
        currentEndpoint = this.newEndpoint(entityName, operationName, endpoint);
        endpoints.push(currentEndpoint);
        detailSection = undefined;
        continue;
      }

      const field = line.match(/^[-*]\s+`?([^`:]+)`?\s*:\s+(.+?)\s*$/);
      if (currentEndpoint && detailSection && field) {
        currentEndpoint[detailSection].push({
          name: field[1].trim(),
          type: field[2].trim(),
        });
      }
    }

    return endpoints;
  }

  private parseEndpointDeclaration(line: string) {
    const cleaned = line
      .replace(/^[-*]\s+/, '')
      .replace(/^\*\*(GET|POST|PATCH|PUT|DELETE)\*\*/i, '$1')
      .replace(/`/g, '')
      .trim();
    const match = cleaned.match(
      /^(GET|POST|PATCH|PUT|DELETE)\s+`?([^`\s|]+)`?(?:\s*(?:[-–—:]\s*)?(.*))?$/i,
    );
    if (!match) {
      const cells = line
        .split('|')
        .map((cell) => cell.trim().replace(/^`|`$/g, ''))
        .filter(Boolean);
      if (
        cells.length >= 2 &&
        /^(GET|POST|PATCH|PUT|DELETE)$/i.test(cells[0]) &&
        cells[1].startsWith('/')
      ) {
        return {
          method: cells[0].toUpperCase(),
          path: cells[1],
          description: cells[2] ?? '',
        };
      }
      return undefined;
    }
    return {
      method: match[1].toUpperCase(),
      path: match[2].trim(),
      description: match[3]?.trim() ?? '',
    };
  }

  private newEndpoint(
    entityName: string,
    operationName: string,
    endpoint: { method: string; path: string; description: string },
  ): TestEndpointSpec {
    return {
      entityName,
      operationName,
      ...endpoint,
      requestFields: [],
      responseFields: [],
    };
  }

  private parseBulletRows(markdown: string): string[] {
    return markdown
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.replace(/^-\s+/, '').trim());
  }

  private firstMarkdownHeading(markdown: string) {
    return markdown.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  }

  private firstParagraphAfterHeading(markdown: string) {
    return markdown
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#') && !line.startsWith('- '));
  }
}
