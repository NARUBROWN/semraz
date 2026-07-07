import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { GeneratedFile } from '../types/build.types';

@Injectable()
export class WorkspaceWriter {
  private readonly workspaceRoot = process.cwd();

  resolveProjectDir(input?: string): string {
    return this.resolveInsideWorkspace(input ?? 'docs');
  }

  createOutputDir(projectDir: string, outputName: string): string {
    const safeName = outputName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!safeName) {
      throw new BadRequestException('outputName must contain a valid name');
    }

    return this.resolveInside(projectDir, safeName);
  }

  async writeFiles(outputDir: string, files: GeneratedFile[]) {
    for (const file of files) {
      const targetPath = this.resolveInside(outputDir, file.path);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, file.content, 'utf8');
    }
  }

  async readTextFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf8');
  }

  async listMarkdownFiles(projectDir: string): Promise<string[]> {
    const results: string[] = [];

    const visit = async (currentDir: string) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === '.git'
        ) {
          continue;
        }

        const absolutePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await visit(absolutePath);
          continue;
        }

        if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          results.push(path.relative(projectDir, absolutePath));
        }
      }
    };

    await visit(projectDir);
    return results.sort();
  }

  async listFiles(rootDir: string): Promise<string[]> {
    const results: string[] = [];

    const visit = async (currentDir: string) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.venv') {
          continue;
        }

        const absolutePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await visit(absolutePath);
        } else {
          results.push(path.relative(rootDir, absolutePath));
        }
      }
    };

    await visit(rootDir);
    return results.sort();
  }

  resolveInside(baseDir: string, unsafePath: string): string {
    const targetPath = path.resolve(baseDir, unsafePath);
    if (!targetPath.startsWith(`${path.resolve(baseDir)}${path.sep}`)) {
      throw new BadRequestException(`Path escapes output directory: ${unsafePath}`);
    }
    return targetPath;
  }

  private resolveInsideWorkspace(input: string): string {
    const targetPath = path.resolve(this.workspaceRoot, input);
    if (
      targetPath !== this.workspaceRoot &&
      !targetPath.startsWith(`${this.workspaceRoot}${path.sep}`)
    ) {
      throw new BadRequestException(`Path escapes workspace: ${input}`);
    }
    return targetPath;
  }
}
