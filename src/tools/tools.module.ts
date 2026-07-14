import { Module } from '@nestjs/common';
import { CommandRunner } from '../builds/runtime/command-runner';
import { WorkspaceWriter } from '../builds/runtime/workspace-writer';
import { AstSearchTool } from './ast-search.tool';
import { CodePatchTool } from './code-patch.tool';
import { FileSearchTool } from './file-search.tool';
import { ScopedTerminalTool } from './scoped-terminal.tool';

@Module({
  providers: [
    CommandRunner,
    WorkspaceWriter,
    AstSearchTool,
    CodePatchTool,
    FileSearchTool,
    ScopedTerminalTool,
  ],
  exports: [
    CommandRunner,
    WorkspaceWriter,
    AstSearchTool,
    CodePatchTool,
    FileSearchTool,
    ScopedTerminalTool,
  ],
})
export class ToolsModule {}
