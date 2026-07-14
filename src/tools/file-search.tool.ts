import { Injectable } from '@nestjs/common';
import { WorkspaceWriter } from '../builds/runtime/workspace-writer';

@Injectable()
export class FileSearchTool {
  constructor(private readonly workspace: WorkspaceWriter) {}

  async search(rootDir: string, params?: { extensions?: string[]; hints?: string[] }) {
    const files = await this.workspace.listFiles(rootDir);
    const extensions = params?.extensions?.map((extension) => extension.toLowerCase());
    const hints = params?.hints?.map((hint) => hint.toLowerCase()) ?? [];

    return files.filter((file) => {
      const lower = file.toLowerCase();
      const extensionMatches =
        !extensions?.length ||
        extensions.some((extension) => lower.endsWith(extension.toLowerCase()));
      const hintMatches =
        hints.length === 0 || hints.some((hint) => lower.includes(hint.toLowerCase()));
      return extensionMatches && hintMatches;
    });
  }
}
