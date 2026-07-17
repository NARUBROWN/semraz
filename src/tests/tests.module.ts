import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BuildsModule } from '../builds/builds.module';
import { TypeScriptLanguageAdapter } from '../builds/languages/typescript-language.adapter';
import { ToolsModule } from '../tools/tools.module';
import { EndpointSpecUnderstandingAgent } from './agents/endpoint-spec-understanding.agent';
import { TestCodebaseSearchAgent } from './agents/test-codebase-search.agent';
import { TestCodeGenerationAgent } from './agents/test-code-generation.agent';
import { TestExecutionAgent } from './agents/test-execution.agent';
import { ApplicationTestGraph } from './graph/application-test.graph';
import { NestJsTestAdapter } from './targets/nestjs-test.adapter';
import { SpineTestAdapter } from './targets/spine-test.adapter';
import { TestTargetAdapterRegistry } from './targets/test-target-adapter.registry';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';

@Module({
  imports: [ToolsModule, BuildsModule, AuthModule],
  controllers: [TestsController],
  providers: [
    TestsService,
    ApplicationTestGraph,
    EndpointSpecUnderstandingAgent,
    TestCodebaseSearchAgent,
    TestCodeGenerationAgent,
    TestExecutionAgent,
    TypeScriptLanguageAdapter,
    NestJsTestAdapter,
    SpineTestAdapter,
    TestTargetAdapterRegistry,
  ],
  exports: [TestsService],
})
export class TestsModule {}
