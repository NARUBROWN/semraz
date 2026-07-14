import { BackendPlannerAgent } from './backend-planner.agent';

describe('BackendPlannerAgent', () => {
  it('does not allow the LLM to overwrite authoritative skeleton text', async () => {
    const referenceTask = {
      id: 'endpoint-user',
      kind: 'endpoint-workflow' as const,
      title: 'Reference',
      description: 'AUTHORITATIVE ENDPOINT SKELETON',
      targetEntity: 'User',
      dependsOn: [],
      allowedFiles: ['src/user/user.controller.ts'],
      doneCriteria: ['exact route set'],
    };
    const llm = {
      generateJson: jest.fn().mockResolvedValue({
        tasks: [
          {
            ...referenceTask,
            title: 'Cosmetic title',
            description: 'invent arbitrary CRUD',
            doneCriteria: ['anything goes'],
          },
        ],
      }),
    };
    const adapter = {
      planBuildTasks: () => ({ tasks: [referenceTask] }),
    };
    const agent = new BackendPlannerAgent(llm as never);
    const plan = await agent.plan(
      {
        projectName: 'test',
        summary: '',
        entities: [],
        endpoints: [],
        businessRules: [],
        assumptions: [],
      },
      adapter as never,
    );
    expect(plan.tasks[0].title).toBe('Cosmetic title');
    expect(plan.tasks[0].description).toBe('AUTHORITATIVE ENDPOINT SKELETON');
    expect(plan.tasks[0].doneCriteria).toEqual(['exact route set']);
  });
});
