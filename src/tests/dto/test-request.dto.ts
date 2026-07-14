import { TargetFramework } from '../../builds/types/build.types';

export class TestRequestDto {
  target?: TargetFramework = TargetFramework.NestJS;
  appDir!: string;
  projectDir?: string;
  maxAttempts?: number;
  workspaceId?: string;
}
