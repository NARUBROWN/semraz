import { Injectable } from '@nestjs/common';
import { OpenAiJsonClient } from '../llm/openai-json.client';
import { TargetAdapter } from '../targets/target-adapter';
import {
  AppSpec,
  BuildTask,
  CodeContext,
  EntitySpec,
  GeneratedFile,
} from '../types/build.types';

@Injectable()
export class CodeGenerationAgent {
  constructor(private readonly llm: OpenAiJsonClient) {}

  async generateEntityFiles(params: {
    spec: AppSpec;
    entity: EntitySpec;
    context: CodeContext;
    adapter: TargetAdapter;
  }): Promise<GeneratedFile[]> {
    const result = await this.llm.generateJson<{ files: GeneratedFile[] }>({
      system:
        'You are a careful backend code generation agent. Return JSON only. Every file must include path and complete content.',
      user: params.adapter.entityGenerationPrompt(params),
      temperature: 0.1,
    });

    const files = (result.files ?? []).filter(
      (file) => file.path && typeof file.content === 'string',
    );
    return params.adapter.normalizeGeneratedFiles(files);
  }

  async generateTaskFiles(params: {
    spec: AppSpec;
    task: BuildTask;
    context: CodeContext;
    adapter: TargetAdapter;
  }): Promise<GeneratedFile[]> {
    const deterministicFiles = params.adapter.deterministicTaskFiles?.(params);
    if (deterministicFiles && deterministicFiles.length > 0) {
      return params.adapter.normalizeGeneratedFiles(deterministicFiles);
    }

    const result = await this.llm.generateJson<{ files: GeneratedFile[] }>({
      system:
        'You are a careful backend task execution agent. Return JSON only. Every file must include path and complete content.',
      user: params.adapter.taskGenerationPrompt(params),
      temperature: 0.08,
    });

    const allowedFiles = new Set(params.task.allowedFiles);
    const files = (result.files ?? []).filter(
      (file) => file.path && typeof file.content === 'string',
    );
    const scopedFiles =
      allowedFiles.size > 0
        ? files.filter((file) => allowedFiles.has(file.path))
        : files;
    return params.adapter.normalizeGeneratedFiles(scopedFiles);
  }
}
