import { Injectable } from '@nestjs/common';
import { OpenAiJsonClient } from '../llm/openai-json.client';
import { AppSpec, BuildPlan, BuildTask } from '../types/build.types';
import { TargetAdapter } from '../targets/target-adapter';

@Injectable()
export class BackendPlannerAgent {
  constructor(private readonly llm: OpenAiJsonClient) {}

  async plan(
    spec: AppSpec,
    adapter: TargetAdapter,
    workspaceId?: string,
  ): Promise<BuildPlan> {
    // The adapter provides a structurally valid scaffold (task kinds,
    // allowedFiles, target entities). The LLM decides ordering, dependencies,
    // and task descriptions on top of it.
    const referencePlan = adapter.planBuildTasks(spec);
    // Large specs are already expressed as deterministic map/reduce tasks by
    // the adapter. Sending the full spec and plan through one cosmetic LLM
    // prompt would reintroduce the context-window failure this plan avoids.
    if (
      JSON.stringify(spec).length + JSON.stringify(referencePlan).length >
      40_000
    ) {
      return referencePlan;
    }

    try {
      const result = await this.llm.generateJson<{ tasks: BuildTask[] }>({
        system: [
          'You are a senior backend build planner.',
          'Return JSON only with shape {"tasks":[BuildTask...]}.',
          'BuildTask shape: {"id":string,"kind":string,"title":string,"description":string,"targetEntity"?:string,"dependsOn":string[],"allowedFiles":string[],"doneCriteria":string[]}.',
        ].join('\n'),
        user: [
          'Order and refine the build task plan for this application.',
          'Rules:',
          '- Keep exactly the same task ids as the reference plan; do not add or remove tasks.',
          '- Keep each task id, kind, targetEntity, and allowedFiles unchanged.',
          '- You decide the execution order (array order) and dependsOn edges.',
          '- Entity field tasks must complete before ORM registration; ORM registration before CRUD features; CRUD features before endpoint workflows; endpoint workflows before business workflows.',
          '- Improve title, description, and doneCriteria so a code generation agent can execute each task precisely for THIS application domain.',
          '- dependsOn may only reference task ids that appear in the plan.',
          '',
          'Application spec:',
          JSON.stringify(spec, null, 2),
          '',
          'Reference plan:',
          JSON.stringify(referencePlan, null, 2),
        ].join('\n'),
        temperature: 0.05,
        context: { workspaceId, caller: 'build-graph:plan-tasks' },
      });

      const validated = this.validatePlan(result?.tasks, referencePlan);
      if (validated) {
        return validated;
      }
    } catch {
      // fall through to the reference plan
    }

    return referencePlan;
  }

  private validatePlan(
    llmTasks: BuildTask[] | undefined,
    referencePlan: BuildPlan,
  ): BuildPlan | null {
    if (!Array.isArray(llmTasks) || llmTasks.length === 0) {
      return null;
    }

    const referenceById = new Map(
      referencePlan.tasks.map((task) => [task.id, task]),
    );
    const llmIds = new Set(llmTasks.map((task) => task?.id));

    if (
      llmIds.size !== llmTasks.length ||
      llmIds.size !== referenceById.size ||
      ![...llmIds].every(
        (id) => typeof id === 'string' && referenceById.has(id),
      )
    ) {
      return null;
    }

    // Only cosmetic titles may come from the LLM. Descriptions and done
    // criteria contain machine-authoritative endpoint/relation skeletons and
    // must remain immutable.
    const tasks = llmTasks.map((llmTask) => {
      const reference = referenceById.get(llmTask.id)!;
      return {
        ...reference,
        title:
          typeof llmTask.title === 'string' && llmTask.title.trim()
            ? llmTask.title
            : reference.title,
        description: reference.description,
        doneCriteria: reference.doneCriteria,
        dependsOn: reference.dependsOn,
      };
    });

    return this.hasExecutableOrder(tasks) ? { tasks } : null;
  }

  private hasExecutableOrder(tasks: BuildTask[]): boolean {
    // Every task must become eligible at some point (no dependency cycles).
    const done = new Set<string>();
    let progressed = true;

    while (done.size < tasks.length && progressed) {
      progressed = false;
      for (const task of tasks) {
        if (!done.has(task.id) && task.dependsOn.every((id) => done.has(id))) {
          done.add(task.id);
          progressed = true;
        }
      }
    }

    return done.size === tasks.length;
  }
}
