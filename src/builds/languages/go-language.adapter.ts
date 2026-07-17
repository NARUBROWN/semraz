import { Injectable } from '@nestjs/common';
import { CodeSymbol, SourceLanguage } from '../types/build.types';
import { LanguageAdapter } from './language-adapter';

@Injectable()
export class GoLanguageAdapter implements LanguageAdapter {
  readonly language = SourceLanguage.Go;
  readonly sourceExtensions = ['.go'];
  readonly configExtensions = ['.mod', '.sum', '.md'];
  readonly contextInstructions = ['Keep Go packages gofmt-compatible.', 'Register DI constructors and routes with Spine.'];
  async searchSymbols(_rootDir: string, _files: string[]): Promise<CodeSymbol[]> { return []; }
}
