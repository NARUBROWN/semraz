import { Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import {
  FilePatch,
  FilePatchFailure,
  GeneratedFile,
} from '../builds/types/build.types';
import { WorkspaceWriter } from '../builds/runtime/workspace-writer';
import { TargetAdapter } from '../builds/targets/target-adapter';

@Injectable()
export class CodePatchTool {
  constructor(private readonly workspace: WorkspaceWriter) {}

  /**
   * Apply targeted find/replace edits to existing files. Each patch is
   * all-or-nothing: if any edit's `find` is missing or ambiguous, the file is
   * left untouched and the failure is reported so the caller can ask the model
   * to resend that file as a full replacement. Preferred over full-file rewrites
   * so passing code is never regenerated.
   */
  async applyEditPatches(
    rootDir: string,
    patches: FilePatch[],
    validate?: (path: string, content: string) => string | undefined,
  ): Promise<{ applied: string[]; failures: FilePatchFailure[] }> {
    const applied: string[] = [];
    const failures: FilePatchFailure[] = [];

    for (const patch of patches) {
      const edits = (patch.edits ?? []).filter(
        (edit) =>
          edit &&
          typeof edit.find === 'string' &&
          edit.find.length > 0 &&
          typeof edit.replace === 'string',
      );
      if (!patch.path || edits.length === 0) {
        failures.push({
          path: patch.path ?? '(missing path)',
          reason: 'patch had no valid edits',
        });
        continue;
      }

      const targetPath = this.workspace.resolveInside(rootDir, patch.path);
      let content: string;
      try {
        content = await fs.readFile(targetPath, 'utf8');
      } catch {
        failures.push({
          path: patch.path,
          reason: 'file does not exist; return it as a full file instead',
        });
        continue;
      }

      let next = content;
      let failedReason: string | undefined;
      for (const edit of edits) {
        const occurrences = next.split(edit.find).length - 1;
        if (occurrences === 0) {
          failedReason = `find text not present: ${this.preview(edit.find)}`;
          break;
        }
        if (occurrences > 1) {
          failedReason = `find text is ambiguous (${occurrences} matches); include more surrounding context: ${this.preview(
            edit.find,
          )}`;
          break;
        }
        next = next.replace(edit.find, () => edit.replace);
      }

      if (failedReason) {
        failures.push({ path: patch.path, reason: failedReason });
        continue;
      }

      // Refuse to write a patch that would leave the file unparseable: keep the
      // original on disk and surface the failure so the next attempt resends a
      // correct patch. A malformed edit must never break the whole suite.
      const syntaxError = validate?.(patch.path, next);
      if (syntaxError) {
        failures.push({
          path: patch.path,
          reason: `patch would break the file (${syntaxError}); resend a corrected patch or the full file`,
        });
        continue;
      }

      await this.workspace.writeFiles(rootDir, [
        { path: patch.path, content: next },
      ]);
      applied.push(patch.path);
    }

    return { applied: applied.sort(), failures };
  }

  private preview(value: string): string {
    const singleLine = value.replace(/\s+/g, ' ').trim();
    return singleLine.length > 80
      ? `${singleLine.slice(0, 80)}…`
      : singleLine;
  }

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

  async applyPlainFileReplacements(rootDir: string, files: GeneratedFile[]) {
    await this.workspace.writeFiles(rootDir, files);
    return files.map((file) => file.path).sort();
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
