import { CodeSymbol, SourceLanguage } from '../types/build.types';

export interface LanguageAdapter {
  language: SourceLanguage;
  sourceExtensions: string[];
  configExtensions: string[];
  contextInstructions: string[];
  searchSymbols(rootDir: string, files: string[]): Promise<CodeSymbol[]>;
}
