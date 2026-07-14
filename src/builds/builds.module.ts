import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BuildController } from './builds.controller';
import { BuildService } from './builds.service';
import { ApplicationBuildGraph } from './graph/application-build.graph';
import { LlmUsageLog } from './llm/llm-usage-log.entity';
import { OpenAiJsonClient } from './llm/openai-json.client';
import { BackendPlannerAgent } from './agents/backend-planner.agent';
import { CodeContextAgent } from './agents/code-context.agent';
import { CodeGenerationAgent } from './agents/code-generation.agent';
import { E2ECheckAgent } from './agents/e2e-check.agent';
import { SyntaxCheckAgent } from './agents/syntax-check.agent';
import { ToolsModule } from '../tools/tools.module';
import { TypeScriptLanguageAdapter } from './languages/typescript-language.adapter';
import { NestJsTargetAdapter } from './targets/nestjs.adapter';
import { TargetAdapterRegistry } from './targets/target-adapter.registry';

@Module({
  imports: [ToolsModule, TypeOrmModule.forFeature([LlmUsageLog])],
  controllers: [BuildController],
  providers: [
    BuildService,
    ApplicationBuildGraph,
    OpenAiJsonClient,
    BackendPlannerAgent,
    CodeContextAgent,
    CodeGenerationAgent,
    E2ECheckAgent,
    SyntaxCheckAgent,
    TypeScriptLanguageAdapter,
    NestJsTargetAdapter,
    TargetAdapterRegistry,
  ],
  exports: [BuildService, OpenAiJsonClient],
})
export class BuildsModule {}
