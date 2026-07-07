import { Injectable } from '@nestjs/common';
import { CodeSymbol, SourceLanguage } from '../types/build.types';
import { AstSearchTool } from '../tools/ast-search.tool';
import { LanguageAdapter } from './language-adapter';

@Injectable()
export class TypeScriptLanguageAdapter implements LanguageAdapter {
  readonly language = SourceLanguage.TypeScript;
  readonly sourceExtensions = ['.ts'];
  readonly configExtensions = ['.json', '.md'];
  readonly contextInstructions = [
    'Keep existing TypeScript source layout and naming conventions.',
    'Prefer patching the smallest set of files required for the current task.',
    'Register generated modules/providers/controllers so the configured build command succeeds.',
  ];

  constructor(private readonly astSearch: AstSearchTool) {}

  searchSymbols(rootDir: string, files: string[]): Promise<CodeSymbol[]> {
    return this.astSearch.searchTypescriptSymbols(rootDir, files);
  }
}
