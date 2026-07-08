import { NestJsTargetAdapter } from './nestjs.adapter';
import { AppSpec, BuildTaskKind } from '../types/build.types';

describe('NestJsTargetAdapter', () => {
  const adapter = new NestJsTargetAdapter({} as never);

  const spec: AppSpec = {
    projectName: 'Endpoint Driven API',
    summary: '',
    entities: [
      {
        name: 'User',
        fields: [
          { name: 'id', type: 'uuid', required: true },
          { name: 'email', type: 'string', required: true },
        ],
        relations: [],
        endpoints: [
          {
            method: 'POST',
            path: '/users',
            operationName: 'Create User',
            requestFields: [{ name: 'email', type: 'string' }],
          },
          {
            method: 'GET',
            path: '/users/:id',
            operationName: 'Get User',
            requestFields: [{ name: 'id', type: 'uuid' }],
          },
          {
            method: 'PUT',
            path: '/users/:id',
            operationName: 'Update User',
            requestFields: [{ name: 'id', type: 'uuid' }],
          },
        ],
        businessRules: [],
      },
      {
        name: 'Profile',
        fields: [
          { name: 'id', type: 'uuid', required: true },
          { name: 'displayName', type: 'string', required: true },
        ],
        relations: [],
        endpoints: [],
        businessRules: [],
      },
    ],
    endpoints: [],
    businessRules: [],
    assumptions: [],
  };

  it('plans feature tasks only for entities with explicit endpoints', () => {
    const featureTasks = adapter
      .planBuildTasks(spec)
      .tasks.filter(
        (task) => task.kind === ('crud-feature' satisfies BuildTaskKind),
      );

    expect(featureTasks).toHaveLength(1);
    expect(featureTasks[0].targetEntity).toBe('User');
  });

  it('generates controllers from endpoint markdown instead of default CRUD routes', () => {
    const task = adapter
      .planBuildTasks(spec)
      .tasks.find(
        (candidate) =>
          candidate.kind === 'crud-feature' &&
          candidate.targetEntity === 'User',
      );

    expect(task).toBeDefined();

    const files = adapter.deterministicTaskFiles({
      spec,
      task: task!,
      context: {
        task,
        entity: spec.entities[0],
        relevantFiles: ['src/app.module.ts'],
        symbols: [],
        previousFailures: [],
        instructions: [],
      },
    });
    const controller = files.find(
      (file) => file.path === 'src/user/user.controller.ts',
    );

    expect(controller?.content).toContain("@Post('users')");
    expect(controller?.content).toContain("@Get('users/:id')");
    expect(controller?.content).toContain("@Put('users/:id')");
    expect(controller?.content).toContain(
      'createUser(@Body() dto: CreateUserDto)',
    );
    expect(controller?.content).toContain("getUser(@Param('id') id: string)");
    expect(controller?.content).not.toContain('endpoint0');
    expect(controller?.content).not.toContain("@Get('users')");
    expect(controller?.content).not.toContain('@Delete');
  });

  it('imports only DTOs and Nest exceptions used by explicit endpoints', () => {
    const readOnlySpec: AppSpec = {
      ...spec,
      entities: [
        {
          ...spec.entities[0],
          endpoints: [
            {
              method: 'GET',
              path: '/users',
              operationName: 'Get Users',
            },
          ],
        },
      ],
    };
    const task = adapter
      .planBuildTasks(readOnlySpec)
      .tasks.find((candidate) => candidate.kind === 'crud-feature');
    const files = adapter.deterministicTaskFiles({
      spec: readOnlySpec,
      task: task!,
      context: {
        task,
        entity: readOnlySpec.entities[0],
        relevantFiles: ['src/app.module.ts'],
        symbols: [],
        previousFailures: [],
        instructions: [],
      },
    });
    const controller = files.find(
      (file) => file.path === 'src/user/user.controller.ts',
    );
    const service = files.find(
      (file) => file.path === 'src/user/user.service.ts',
    );

    expect(controller?.content).not.toContain('CreateUserDto');
    expect(controller?.content).not.toContain('UpdateUserDto');
    expect(service?.content).not.toContain('NotFoundException');
    expect(service?.content).not.toContain('CreateUserDto');
    expect(service?.content).not.toContain('UpdateUserDto');
    expect(service?.content).toContain('async getUsers()');
    expect(files.map((file) => file.path)).not.toContain(
      'src/user/dto/create-user.dto.ts',
    );
    expect(files.map((file) => file.path)).not.toContain(
      'src/user/dto/update-user.dto.ts',
    );
  });

  it('keeps endpointless modules out of AppModule feature imports', () => {
    const task = adapter
      .planBuildTasks(spec)
      .tasks.find(
        (candidate) =>
          candidate.kind === 'crud-feature' &&
          candidate.targetEntity === 'User',
      );
    const files = adapter.deterministicTaskFiles({
      spec,
      task: task!,
      context: {
        task,
        entity: spec.entities[0],
        relevantFiles: ['src/app.module.ts'],
        symbols: [],
        previousFailures: [],
        instructions: [],
      },
    });
    const appModule = files.find((file) => file.path === 'src/app.module.ts');

    expect(appModule?.content).toContain('UserModule');
    expect(appModule?.content).toContain('controllers: [AppController]');
    expect(appModule?.content).not.toContain('ProfileModule');
  });
});
