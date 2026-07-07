import { Injectable } from '@nestjs/common';
import { AppSpec, BuildPlan } from '../types/build.types';
import { TargetAdapter } from '../targets/target-adapter';

@Injectable()
export class BackendPlannerAgent {
  plan(spec: AppSpec, adapter: TargetAdapter): BuildPlan {
    return adapter.planBuildTasks(spec);
  }
}
