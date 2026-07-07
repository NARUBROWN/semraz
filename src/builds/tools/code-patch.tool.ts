import { Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { GeneratedFile } from '../types/build.types';
import { WorkspaceWriter } from '../runtime/workspace-writer';
import { TargetAdapter } from '../targets/target-adapter';

@Injectable()
export class CodePatchTool {
  constructor(private readonly workspace: WorkspaceWriter) {}

  async applyFileReplacements(
    rootDir: string,
    files: GeneratedFile[],
    adapter: TargetAdapter,
  ) {
    const mergedFiles = await Promise.all(
      files.map(async (file) => this.mergeGeneratedFile(rootDir, file, adapter)),
    );
    await this.workspace.writeFiles(rootDir, mergedFiles);
    const changedFiles = mergedFiles.map((file) => file.path).sort();
    const postProcessedFiles = await adapter.postProcessAppliedFiles({
      rootDir,
      changedFiles,
      workspace: this.workspace,
    });
    return Array.from(new Set([...changedFiles, ...postProcessedFiles])).sort();
  }

  private async mergeGeneratedFile(
    rootDir: string,
    file: GeneratedFile,
    adapter: TargetAdapter,
  ): Promise<GeneratedFile> {
    const targetPath = this.workspace.resolveInside(rootDir, file.path);
    let existingContent: string | undefined;
    try {
      existingContent = await fs.readFile(targetPath, 'utf8');
    } catch {
    }

    return adapter.mergeGeneratedFile({ rootDir, file, existingContent });
  }
}
