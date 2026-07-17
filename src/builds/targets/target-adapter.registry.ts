import { BadRequestException, Injectable } from '@nestjs/common';
import { TargetFramework } from '../types/build.types';
import { NestJsTargetAdapter } from './nestjs.adapter';
import { SpineTargetAdapter } from './spine.adapter';
import { TargetAdapter } from './target-adapter';

@Injectable()
export class TargetAdapterRegistry {
  private readonly adapters: Partial<Record<TargetFramework, TargetAdapter>>;

  constructor(nestJsAdapter: NestJsTargetAdapter, spineAdapter: SpineTargetAdapter) {
    this.adapters = {
      [TargetFramework.NestJS]: nestJsAdapter,
      [TargetFramework.SpineGo]: spineAdapter,
    };
  }

  get(target: TargetFramework): TargetAdapter {
    const adapter = this.adapters[target];
    if (!adapter) {
      throw new BadRequestException(
        `${target} generation is not implemented yet.`,
      );
    }
    return adapter;
  }
}
