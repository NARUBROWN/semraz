import { Controller, Get } from '@nestjs/common';

const projects = [
  {
    id: 'prj_order_core',
    name: 'Order Core API',
    description: 'Order, payment, and shipment workflow backend.',
    framework: 'NestJS',
    database: 'PostgreSQL',
    status: 'planning',
    currentStep: 'ERD',
    updatedAt: '2026-07-06T06:30:00.000Z',
    metrics: {
      entities: 5,
      operations: 18,
      tests: 0,
    },
  },
  {
    id: 'prj_member_ops',
    name: 'Member Ops Service',
    description: 'Internal member profile and role management service.',
    framework: 'NestJS',
    database: 'PostgreSQL',
    status: 'compile_failed',
    currentStep: 'Compile',
    updatedAt: '2026-07-05T11:15:00.000Z',
    metrics: {
      entities: 8,
      operations: 31,
      tests: 14,
    },
  },
];

@Controller('api/projects')
export class ProjectsController {
  @Get()
  findAll() {
    return projects;
  }
}
