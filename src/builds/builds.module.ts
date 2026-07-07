import { Module } from '@nestjs/common';
import { BuildController } from './builds.controller';
import { BuildService } from './builds.service';
import { ApplicationBuildGraph } from './graph/application-build.graph';
import { OpenAiJsonClient } from './llm/openai-json.client';
import { CommandRunner } from './runtime/command-runner';
import { WorkspaceWriter } from './runtime/workspace-writer';
import { BackendPlannerAgent } from './agents/backend-planner.agent';
import { CodeContextAgent } from './agents/code-context.agent';
import { CodeGenerationAgent } from './agents/code-generation.agent';
import { E2ECheckAgent } from './agents/e2e-check.agent';
import { SyntaxCheckAgent } from './agents/syntax-check.agent';
import { AstSearchTool } from './tools/ast-search.tool';
import { CodePatchTool } from './tools/code-patch.tool';
import { FileSearchTool } from './tools/file-search.tool';
import { ScopedTerminalTool } from './tools/scoped-terminal.tool';
import { TypeScriptLanguageAdapter } from './languages/typescript-language.adapter';
import { NestJsTargetAdapter } from './targets/nestjs.adapter';
import { TargetAdapterRegistry } from './targets/target-adapter.registry';

@Module({
  controllers: [BuildController],
  providers: [
    BuildService,
    ApplicationBuildGraph,
    OpenAiJsonClient,
    CommandRunner,
    WorkspaceWriter,
    BackendPlannerAgent,
    CodeContextAgent,
    CodeGenerationAgent,
    E2ECheckAgent,
    SyntaxCheckAgent,
    AstSearchTool,
    CodePatchTool,
    FileSearchTool,
    ScopedTerminalTool,
    TypeScriptLanguageAdapter,
    NestJsTargetAdapter,
    TargetAdapterRegistry,
  ],
  exports: [BuildService],
})
export class BuildsModule {}
