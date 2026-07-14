import { BadRequestException, Injectable } from '@nestjs/common';
import { TargetFramework } from '../../builds/types/build.types';
import { NestJsTestAdapter } from './nestjs-test.adapter';
import { TestTargetAdapter } from './test-target-adapter';

@Injectable()
export class TestTargetAdapterRegistry {
  private readonly adapters: Partial<Record<TargetFramework, TestTargetAdapter>>;

  constructor(nestJsTestAdapter: NestJsTestAdapter) {
    this.adapters = {
      [TargetFramework.NestJS]: nestJsTestAdapter,
    };
  }

  get(target: TargetFramework): TestTargetAdapter {
    const adapter = this.adapters[target];
    if (!adapter) {
      throw new BadRequestException(
        `${target} test generation is not implemented yet. NestJS is currently supported.`,
      );
    }
    return adapter;
  }
}
