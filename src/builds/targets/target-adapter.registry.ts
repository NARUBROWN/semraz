import { BadRequestException, Injectable } from '@nestjs/common';
import { TargetFramework } from '../types/build.types';
import { NestJsTargetAdapter } from './nestjs.adapter';
import { TargetAdapter } from './target-adapter';

@Injectable()
export class TargetAdapterRegistry {
  private readonly adapters: Partial<Record<TargetFramework, TargetAdapter>>;

  constructor(nestJsAdapter: NestJsTargetAdapter) {
    this.adapters = {
      [TargetFramework.NestJS]: nestJsAdapter,
    };
  }

  get(target: TargetFramework): TargetAdapter {
    const adapter = this.adapters[target];
    if (!adapter) {
      throw new BadRequestException(
        `${target} generation is not implemented yet. NestJS is currently supported.`,
      );
    }
    return adapter;
  }
}
