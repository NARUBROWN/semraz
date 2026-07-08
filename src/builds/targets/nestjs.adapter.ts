import { Injectable } from '@nestjs/common';
import {
  AppSpec,
  BuildPlan,
  BuildTask,
  CodeContext,
  CommandSpec,
  EntitySpec,
  GeneratedFile,
  TargetFramework,
} from '../types/build.types';
import { TypeScriptLanguageAdapter } from '../languages/typescript-language.adapter';
import { WorkspaceWriter } from '../runtime/workspace-writer';
import { TargetAdapter } from './target-adapter';

type EndpointSpec = {
  method: string;
  path: string;
  operationName?: string;
  description?: string;
  requestFields?: Array<Record<string, unknown>>;
  responseFields?: Array<Record<string, unknown>>;
};

@Injectable()
export class NestJsTargetAdapter implements TargetAdapter {
  readonly target = TargetFramework.NestJS;

  constructor(readonly language: TypeScriptLanguageAdapter) {}

  readonly planningGuidance =
    'Plan a minimal but complete NestJS TypeScript backend shell first. Entity feature modules will be added later by an entity implementation loop.';

  readonly bootstrapGuidance = [
    'Generate a buildable NestJS TypeScript backend shell.',
    'Include package.json, tsconfig files, nest-cli.json, src/main.ts, src/app.module.ts, .env.example, and README.md.',
    'Use NestJS 10, TypeScript 5, @types/node 22, reflect-metadata 0.2, class-validator 0.14, class-transformer 0.5, @nestjs/typeorm 10, typeorm 0.3, and sql.js.',
    'Use "nest build" for the build script, not plain "tsc".',
    'Do not implement business entities yet unless required for the app to compile.',
    'Set up validation pipe and a simple health endpoint or root endpoint.',
    'Include scripts for build and start.',
  ].join('\n');

  bootstrapFiles(spec: AppSpec): GeneratedFile[] {
    const projectSlug = this.toKebabCase(
      spec.projectName || 'generated-backend',
    );
    const files: GeneratedFile[] = [
      {
        path: 'package.json',
        content: JSON.stringify(
          {
            name: projectSlug,
            version: '0.1.0',
            private: true,
            scripts: {
              build: 'nest build',
              start: 'node dist/main.js',
              'start:dev': 'nest start --watch',
              typecheck: 'tsc --noEmit',
            },
            dependencies: {
              '@nestjs/common': '^10.4.15',
              '@nestjs/core': '^10.4.15',
              '@nestjs/platform-express': '^10.4.15',
              '@nestjs/swagger': '^7.4.2',
              '@nestjs/typeorm': '^10.0.2',
              'class-transformer': '^0.5.1',
              'class-validator': '^0.14.1',
              'reflect-metadata': '^0.2.2',
              rxjs: '^7.8.1',
              'sql.js': '^1.12.0',
              typeorm: '^0.3.20',
            },
            devDependencies: {
              '@nestjs/cli': '^10.4.8',
              '@nestjs/schematics': '^10.2.3',
              '@nestjs/testing': '^10.4.15',
              '@types/node': '^22.10.2',
              typescript: '^5.7.2',
            },
          },
          null,
          2,
        ),
      },
      {
        path: 'tsconfig.json',
        content: JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'Node16',
              moduleResolution: 'node16',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              forceConsistentCasingInFileNames: true,
              outDir: './dist',
              rootDir: 'src',
              experimentalDecorators: true,
              emitDecoratorMetadata: true,
              strictPropertyInitialization: false,
              sourceMap: true,
            },
            include: ['src/**/*'],
            exclude: ['node_modules', 'dist'],
          },
          null,
          2,
        ),
      },
      {
        path: 'tsconfig.build.json',
        content: JSON.stringify(
          {
            extends: './tsconfig.json',
            exclude: ['node_modules', 'dist', 'test', '**/*spec.ts'],
          },
          null,
          2,
        ),
      },
      {
        path: 'nest-cli.json',
        content: JSON.stringify(
          {
            collection: '@nestjs/schematics',
            sourceRoot: 'src',
            compilerOptions: {
              deleteOutDir: true,
            },
          },
          null,
          2,
        ),
      },
      {
        path: 'src/main.ts',
        content: [
          "import { ValidationPipe } from '@nestjs/common';",
          "import { NestFactory } from '@nestjs/core';",
          "import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';",
          "import { AppModule } from './app.module';",
          '',
          'async function bootstrap() {',
          '  const app = await NestFactory.create(AppModule);',
          '  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));',
          '',
          '  const config = new DocumentBuilder()',
          `    .setTitle('${this.escapeSingleQuote(spec.projectName || 'Generated Backend')}')`,
          "    .setDescription('Generated backend API')",
          "    .setVersion('0.1.0')",
          '    .build();',
          '  const document = SwaggerModule.createDocument(app, config);',
          "  SwaggerModule.setup('docs', app, document);",
          '',
          "  const port = Number(process.env.PORT ?? '3000');",
          "  await app.listen(port, '0.0.0.0');",
          '}',
          '',
          'void bootstrap();',
          '',
        ].join('\n'),
      },
      {
        path: 'src/app.module.ts',
        content: [
          "import { Module } from '@nestjs/common';",
          "import { TypeOrmModule } from '@nestjs/typeorm';",
          "import { AppController } from './app.controller';",
          '',
          '@Module({',
          '  imports: [',
          '    TypeOrmModule.forRoot({',
          "      type: 'sqljs',",
          '      autoSave: false,',
          '      synchronize: true,',
          '      entities: [],',
          '    }),',
          '  ],',
          '  controllers: [AppController],',
          '  providers: [],',
          '})',
          'export class AppModule {}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/app.controller.ts',
        content: [
          "import { Controller, Get } from '@nestjs/common';",
          "import { ApiTags } from '@nestjs/swagger';",
          '',
          "@ApiTags('health')",
          '@Controller()',
          'export class AppController {',
          "  @Get('health')",
          '  health() {',
          "    return { status: 'ok' };",
          '  }',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: '.env.example',
        content: ['PORT=3000', ''].join('\n'),
      },
      {
        path: 'README.md',
        content: [
          `# ${spec.projectName || 'Generated Backend'}`,
          '',
          'Generated NestJS backend application.',
          '',
          '## Commands',
          '',
          '- `npm install`',
          '- `npm run build`',
          '- `npm run start`',
          '',
          'Swagger is available at `/docs` when the app is running.',
          '',
        ].join('\n'),
      },
    ];

    return this.normalizeGeneratedFiles(files);
  }

  planBuildTasks(spec: AppSpec): BuildPlan {
    const tasks: BuildTask[] = [];

    for (const entity of spec.entities) {
      tasks.push(this.entityFieldsTask(entity));
    }

    const entityFieldTaskIds = spec.entities.map(
      (entity) => `entity-${this.toKebabCase(entity.name)}-fields`,
    );
    const hasRelations = spec.entities.some(
      (entity) => entity.relations.length > 0,
    );
    if (hasRelations) {
      tasks.push(this.entityRelationsTask(spec.entities, entityFieldTaskIds));
    }

    if (spec.entities.length > 0) {
      tasks.push(this.ormRegistrationTask(spec.entities));
    }

    for (const entity of spec.entities.filter(
      (candidate) => candidate.endpoints.length > 0,
    )) {
      tasks.push(this.crudFeatureTask(entity, spec.entities));
    }

    if (this.hasBusinessWorkflowRequirements(spec)) {
      tasks.push(this.businessWorkflowTask(spec.entities, hasRelations));
    }

    return { tasks };
  }

  taskContextHints(task: BuildTask): string[] {
    const hints = [
      'AppModule',
      '@Module',
      '@Controller',
      '@Injectable',
      'TypeOrmModule',
      'Repository',
    ];
    if (task.targetEntity) {
      hints.push(
        task.targetEntity.toLowerCase(),
        this.toKebabCase(task.targetEntity),
        `${this.toPascalCase(task.targetEntity)}Module`,
        `${this.toPascalCase(task.targetEntity)}Controller`,
        `${this.toPascalCase(task.targetEntity)}Service`,
      );
    }
    return hints;
  }

  taskGenerationPrompt(params: {
    spec: AppSpec;
    task: BuildTask;
    context: CodeContext;
  }): string {
    return [
      'Execute exactly one planned NestJS backend task.',
      'Return JSON shape: {"files":[{"path":"relative/path","content":"complete file content"}]}.',
      'Return complete replacement content for changed files, not snippets.',
      'You must only create or modify files listed in currentTask.allowedFiles.',
      'If currentTask.allowedFiles does not include a file, do not return that file.',
      'Do not jump ahead to unrelated tasks.',
      'Use NestJS 10, TypeScript 5, TypeORM 0.3, and @nestjs/typeorm 10.',
      'With TypeORM 0.3 repositories, never call repository.findOne(id); use repository.findOne({ where: { id } }) or findOneBy({ id }).',
      'Use definite assignment assertions for entity and DTO properties where needed, for example "id!: string".',
      'Keep code buildable with npm run build.',
      'When currentTask.kind is "entity-relations", relation inverse-side lambdas must reference properties that actually exist on the related class.',
      'When currentTask.kind is "entity-relations", update both sides of every relationship in the spec; if Payment has invoice => Invoice, Invoice must declare payments: Payment[] with @OneToMany.',
      'When a previous TypeScript error says Property "x" does not exist on type "Y", either change the inverse-side lambda to an existing property or add property "x" to class Y if Y is in currentTask.allowedFiles.',
      'When currentTask.kind is "business-workflow", implement only workflows that are explicitly supported by the normalized spec and existing entity files.',
      'When currentTask.kind is "business-workflow", create or update only the dedicated business-workflows module/controller/service/DTO files and AppModule registration.',
      'When currentTask.kind is "business-workflow", do not edit or replace existing entity CRUD services/controllers; preserve all generated CRUD features.',
      'When currentTask.kind is "business-workflow", never import or reference an entity that is not present in the normalized spec and generated source tree.',
      'Business workflow methods that update multiple tables must use TypeORM DataSource.transaction or an equivalent transaction manager.',
      'For stock workflows, InventoryBalance quantityOnHand and quantityReserved are the source of truth; reject insufficient or negative stock with BadRequestException.',
      'For sales shipping, create outbound StockMovement rows, update SalesOrder status, and create an Invoice in the same transaction.',
      'For purchase receiving, create inbound StockMovement rows, update InventoryBalance, and update PurchaseOrder status in the same transaction.',
      'For payments, create Payment and update Invoice.amountPaid/status in the same transaction.',
      'For workflow endpoints with route params like :id, service methods must accept the route id as a separate string parameter and must not read dto.id unless the DTO explicitly declares it.',
      'For workflow services, import every entity class passed to manager.find, manager.findOne, manager.create, or manager.save so TypeScript can infer entity property types.',
      'For workflow DTOs, declare every property the service reads, such as payment method/reference/paidAt when recording payments.',
      'For workflow services, after manager.findOne calls, check for null and throw before reading or saving the entity so strict null checks pass.',
      'For one-to-one relationships, use singular inverse properties such as "invoice" instead of plural names unless the related class declares the plural property.',
      'If codeContext.previousFailures contains TypeScript errors, fix those exact errors first and preserve already working files.',
      '',
      'Current task:',
      JSON.stringify(params.task, null, 2),
      '',
      'Full application spec:',
      JSON.stringify(params.spec, null, 2),
      '',
      'Code context:',
      JSON.stringify(params.context, null, 2),
    ].join('\n');
  }

  deterministicTaskFiles(params: {
    spec: AppSpec;
    task: BuildTask;
    context: CodeContext;
  }): GeneratedFile[] {
    if (params.task.kind === 'entity-fields') {
      const entity = this.findTaskEntity(params.spec, params.task);
      return entity ? [this.entityFile(entity)] : [];
    }

    if (params.task.kind === 'orm-registration') {
      return [this.appModuleFile(params.spec.entities, [])];
    }

    if (params.task.kind === 'crud-feature') {
      const entity = this.findTaskEntity(params.spec, params.task);
      return entity
        ? this.crudFeatureFiles(params.spec, entity, params.context)
        : [];
    }

    if (params.task.kind !== 'business-workflow') {
      return [];
    }

    return [
      {
        path: 'src/app.module.ts',
        content: [
          "import { Module } from '@nestjs/common';",
          "import { BusinessWorkflowsModule } from './business-workflows/business-workflows.module';",
          '',
          '@Module({',
          '  imports: [BusinessWorkflowsModule],',
          '})',
          'export class AppModule {}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/business-workflows/business-workflows.module.ts',
        content: [
          "import { Module } from '@nestjs/common';",
          "import { BusinessWorkflowsController } from './business-workflows.controller';",
          "import { BusinessWorkflowsService } from './business-workflows.service';",
          '',
          '@Module({',
          '  controllers: [BusinessWorkflowsController],',
          '  providers: [BusinessWorkflowsService],',
          '})',
          'export class BusinessWorkflowsModule {}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/business-workflows/business-workflows.controller.ts',
        content: [
          "import { Body, Controller, Param, Post } from '@nestjs/common';",
          "import { ApiTags } from '@nestjs/swagger';",
          "import { BusinessWorkflowsService } from './business-workflows.service';",
          "import { ConfirmSalesOrderDto } from './dto/confirm-sales-order.dto';",
          "import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';",
          "import { RecordPaymentDto } from './dto/record-payment.dto';",
          "import { ShipSalesOrderDto } from './dto/ship-sales-order.dto';",
          '',
          "@ApiTags('business-workflows')",
          '@Controller()',
          'export class BusinessWorkflowsController {',
          '  constructor(private readonly service: BusinessWorkflowsService) {}',
          '',
          "  @Post('purchase-orders/:id/receive')",
          "  receivePurchaseOrder(@Param('id') id: string, @Body() dto: ReceivePurchaseOrderDto) {",
          '    return this.service.receivePurchaseOrder(id, dto);',
          '  }',
          '',
          "  @Post('sales-orders/:id/confirm')",
          "  confirmSalesOrder(@Param('id') id: string, @Body() dto: ConfirmSalesOrderDto) {",
          '    return this.service.confirmSalesOrder(id, dto);',
          '  }',
          '',
          "  @Post('sales-orders/:id/ship')",
          "  shipSalesOrder(@Param('id') id: string, @Body() dto: ShipSalesOrderDto) {",
          '    return this.service.shipSalesOrder(id, dto);',
          '  }',
          '',
          "  @Post('payments')",
          '  recordPayment(@Body() dto: RecordPaymentDto) {',
          '    return this.service.recordPayment(dto);',
          '  }',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/business-workflows/business-workflows.service.ts',
        content: [
          "import { BadRequestException, Injectable } from '@nestjs/common';",
          "import { DataSource } from 'typeorm';",
          "import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';",
          "import { Invoice } from '../invoice/invoice.entity';",
          "import { Payment } from '../payment/payment.entity';",
          "import { PurchaseOrder } from '../purchase-order/purchase-order.entity';",
          "import { PurchaseOrderLine } from '../purchase-order-line/purchase-order-line.entity';",
          "import { SalesOrder } from '../sales-order/sales-order.entity';",
          "import { SalesOrderLine } from '../sales-order-line/sales-order-line.entity';",
          "import { StockMovement } from '../stock-movement/stock-movement.entity';",
          "import { ConfirmSalesOrderDto } from './dto/confirm-sales-order.dto';",
          "import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';",
          "import { RecordPaymentDto } from './dto/record-payment.dto';",
          "import { ShipSalesOrderDto } from './dto/ship-sales-order.dto';",
          '',
          '@Injectable()',
          'export class BusinessWorkflowsService {',
          '  constructor(private readonly dataSource: DataSource) {}',
          '',
          '  async receivePurchaseOrder(id: string, _dto: ReceivePurchaseOrderDto) {',
          '    return this.dataSource.transaction(async (manager) => {',
          '      const purchaseOrder = await manager.findOne(PurchaseOrder, { where: { id } });',
          "      if (!purchaseOrder) throw new BadRequestException('Purchase order not found');",
          "      if (purchaseOrder.status !== 'approved') throw new BadRequestException('Only approved purchase orders can be received');",
          '',
          '      const lines = await manager.find(PurchaseOrderLine, { where: { purchaseOrderId: id } });',
          "      if (lines.length === 0) throw new BadRequestException('Purchase order has no lines');",
          '',
          '      for (const line of lines) {',
          "        if (line.quantity <= 0) throw new BadRequestException('Purchase order line quantity must be positive');",
          '        let balance = await manager.findOne(InventoryBalance, {',
          '          where: { itemId: line.itemId, warehouseId: line.warehouseId },',
          '        });',
          '        if (!balance) {',
          '          balance = manager.create(InventoryBalance, {',
          '            itemId: line.itemId,',
          '            warehouseId: line.warehouseId,',
          '            quantityOnHand: 0,',
          '            quantityReserved: 0,',
          '            updatedAt: new Date().toISOString(),',
          '          });',
          '        }',
          '        balance.quantityOnHand += line.quantity;',
          '        balance.updatedAt = new Date().toISOString();',
          '        await manager.save(InventoryBalance, balance);',
          '',
          '        const movement = manager.create(StockMovement, {',
          '          itemId: line.itemId,',
          '          warehouseId: line.warehouseId,',
          "          movementType: 'inbound',",
          '          quantity: line.quantity,',
          '          reason: `Received purchase order ${purchaseOrder.orderNumber}`,',
          '          createdAt: new Date().toISOString(),',
          '        });',
          '        await manager.save(StockMovement, movement);',
          '      }',
          '',
          "      purchaseOrder.status = 'received';",
          '      await manager.save(PurchaseOrder, purchaseOrder);',
          '      return purchaseOrder;',
          '    });',
          '  }',
          '',
          '  async confirmSalesOrder(id: string, _dto: ConfirmSalesOrderDto) {',
          '    return this.dataSource.transaction(async (manager) => {',
          '      const salesOrder = await manager.findOne(SalesOrder, { where: { id } });',
          "      if (!salesOrder) throw new BadRequestException('Sales order not found');",
          "      if (salesOrder.status !== 'draft') throw new BadRequestException('Only draft sales orders can be confirmed');",
          '',
          '      const lines = await manager.find(SalesOrderLine, { where: { salesOrderId: id } });',
          "      if (lines.length === 0) throw new BadRequestException('Sales order has no lines');",
          '',
          '      for (const line of lines) {',
          "        if (line.quantity <= 0) throw new BadRequestException('Sales order line quantity must be positive');",
          '        const balance = await manager.findOne(InventoryBalance, {',
          '          where: { itemId: line.itemId, warehouseId: line.warehouseId },',
          '        });',
          "        if (!balance) throw new BadRequestException('Inventory balance not found');",
          '        const available = balance.quantityOnHand - balance.quantityReserved;',
          "        if (available < line.quantity) throw new BadRequestException('Insufficient available stock');",
          '        balance.quantityReserved += line.quantity;',
          '        balance.updatedAt = new Date().toISOString();',
          '        await manager.save(InventoryBalance, balance);',
          '      }',
          '',
          "      salesOrder.status = 'confirmed';",
          '      await manager.save(SalesOrder, salesOrder);',
          '      return salesOrder;',
          '    });',
          '  }',
          '',
          '  async shipSalesOrder(id: string, _dto: ShipSalesOrderDto) {',
          '    return this.dataSource.transaction(async (manager) => {',
          '      const salesOrder = await manager.findOne(SalesOrder, { where: { id } });',
          "      if (!salesOrder) throw new BadRequestException('Sales order not found');",
          "      if (salesOrder.status !== 'confirmed') throw new BadRequestException('Only confirmed sales orders can be shipped');",
          '',
          '      const lines = await manager.find(SalesOrderLine, { where: { salesOrderId: id } });',
          "      if (lines.length === 0) throw new BadRequestException('Sales order has no lines');",
          '',
          '      for (const line of lines) {',
          '        const balance = await manager.findOne(InventoryBalance, {',
          '          where: { itemId: line.itemId, warehouseId: line.warehouseId },',
          '        });',
          "        if (!balance) throw new BadRequestException('Inventory balance not found');",
          '        if (balance.quantityOnHand < line.quantity || balance.quantityReserved < line.quantity) {',
          "          throw new BadRequestException('Insufficient stock to ship sales order');",
          '        }',
          '        balance.quantityOnHand -= line.quantity;',
          '        balance.quantityReserved -= line.quantity;',
          '        if (balance.quantityOnHand < 0 || balance.quantityReserved < 0) {',
          "          throw new BadRequestException('Inventory balance cannot become negative');",
          '        }',
          '        balance.updatedAt = new Date().toISOString();',
          '        await manager.save(InventoryBalance, balance);',
          '',
          '        const movement = manager.create(StockMovement, {',
          '          itemId: line.itemId,',
          '          warehouseId: line.warehouseId,',
          "          movementType: 'outbound',",
          '          quantity: line.quantity,',
          '          reason: `Shipped sales order ${salesOrder.orderNumber}`,',
          '          createdAt: new Date().toISOString(),',
          '        });',
          '        await manager.save(StockMovement, movement);',
          '      }',
          '',
          '      let invoice = await manager.findOne(Invoice, { where: { salesOrderId: id } });',
          '      if (!invoice) {',
          '        invoice = manager.create(Invoice, {',
          '          invoiceNumber: `INV-${salesOrder.orderNumber}`,',
          '          salesOrderId: salesOrder.id,',
          '          customerId: salesOrder.customerId,',
          "          status: 'issued',",
          '          amountDue: salesOrder.totalAmount,',
          '          amountPaid: 0,',
          '          issuedAt: new Date().toISOString(),',
          '        });',
          '        await manager.save(Invoice, invoice);',
          '      }',
          '',
          "      salesOrder.status = 'shipped';",
          '      await manager.save(SalesOrder, salesOrder);',
          '      return { salesOrder, invoice };',
          '    });',
          '  }',
          '',
          '  async recordPayment(dto: RecordPaymentDto) {',
          '    return this.dataSource.transaction(async (manager) => {',
          "      if (dto.amount <= 0) throw new BadRequestException('Payment amount must be positive');",
          '      const invoice = await manager.findOne(Invoice, { where: { id: dto.invoiceId } });',
          "      if (!invoice) throw new BadRequestException('Invoice not found');",
          '      const nextPaid = invoice.amountPaid + dto.amount;',
          '      if (nextPaid > invoice.amountDue) {',
          "        throw new BadRequestException('Payment exceeds invoice amount due');",
          '      }',
          '',
          '      const payment = manager.create(Payment, {',
          '        invoiceId: dto.invoiceId,',
          '        amount: dto.amount,',
          '        method: dto.method,',
          '        paidAt: dto.paidAt ?? new Date().toISOString(),',
          '        reference: dto.reference,',
          '      });',
          '      await manager.save(Payment, payment);',
          '',
          '      invoice.amountPaid = nextPaid;',
          "      invoice.status = nextPaid === invoice.amountDue ? 'paid' : 'partially_paid';",
          '      await manager.save(Invoice, invoice);',
          '      return { invoice, payment };',
          '    });',
          '  }',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/business-workflows/dto/receive-purchase-order.dto.ts',
        content: [
          "import { ApiPropertyOptional } from '@nestjs/swagger';",
          "import { IsOptional, IsString } from 'class-validator';",
          '',
          'export class ReceivePurchaseOrderDto {',
          '  @ApiPropertyOptional()',
          '  @IsOptional()',
          '  @IsString()',
          '  note?: string;',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/business-workflows/dto/confirm-sales-order.dto.ts',
        content: [
          "import { ApiPropertyOptional } from '@nestjs/swagger';",
          "import { IsOptional, IsString } from 'class-validator';",
          '',
          'export class ConfirmSalesOrderDto {',
          '  @ApiPropertyOptional()',
          '  @IsOptional()',
          '  @IsString()',
          '  note?: string;',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/business-workflows/dto/ship-sales-order.dto.ts',
        content: [
          "import { ApiPropertyOptional } from '@nestjs/swagger';",
          "import { IsOptional, IsString } from 'class-validator';",
          '',
          'export class ShipSalesOrderDto {',
          '  @ApiPropertyOptional()',
          '  @IsOptional()',
          '  @IsString()',
          '  note?: string;',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/business-workflows/dto/record-payment.dto.ts',
        content: [
          "import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';",
          "import { IsNumber, IsOptional, IsString, Min } from 'class-validator';",
          '',
          'export class RecordPaymentDto {',
          '  @ApiProperty()',
          '  @IsString()',
          '  invoiceId!: string;',
          '',
          '  @ApiProperty()',
          '  @IsNumber()',
          '  @Min(0.01)',
          '  amount!: number;',
          '',
          '  @ApiProperty()',
          '  @IsString()',
          '  method!: string;',
          '',
          '  @ApiPropertyOptional()',
          '  @IsOptional()',
          '  @IsString()',
          '  paidAt?: string;',
          '',
          '  @ApiPropertyOptional()',
          '  @IsOptional()',
          '  @IsString()',
          '  reference?: string;',
          '}',
          '',
        ].join('\n'),
      },
    ];
  }

  private findTaskEntity(spec: AppSpec, task: BuildTask) {
    return spec.entities.find((entity) => entity.name === task.targetEntity);
  }

  private entityFile(entity: EntitySpec): GeneratedFile {
    const className = this.toPascalCase(entity.name);
    const lines = [
      "import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';",
      '',
      '@Entity()',
      `export class ${className} {`,
    ];

    for (const field of entity.fields) {
      const name = this.fieldName(field);
      if (!name) {
        continue;
      }

      if (name === 'id') {
        lines.push("  @PrimaryGeneratedColumn('uuid')");
        lines.push('  id!: string;');
        lines.push('');
        continue;
      }

      lines.push(`  @Column(${this.columnOptions(field)})`);
      lines.push(`  ${name}!: ${this.tsType(field)};`);
      lines.push('');
    }

    lines.push('}');
    lines.push('');

    return {
      path: `src/${this.toKebabCase(entity.name)}/${this.toKebabCase(entity.name)}.entity.ts`,
      content: lines.join('\n'),
    };
  }

  private appModuleFile(
    entities: EntitySpec[],
    featureEntities: EntitySpec[],
  ): GeneratedFile {
    const entityImports = entities.map((entity) => {
      const slug = this.toKebabCase(entity.name);
      return `import { ${this.toPascalCase(entity.name)} } from './${slug}/${slug}.entity';`;
    });
    const moduleImports = featureEntities.map((entity) => {
      const slug = this.toKebabCase(entity.name);
      return `import { ${this.toPascalCase(entity.name)}Module } from './${slug}/${slug}.module';`;
    });
    const entityNames = entities.map((entity) =>
      this.toPascalCase(entity.name),
    );
    const moduleNames = featureEntities.map(
      (entity) => `${this.toPascalCase(entity.name)}Module`,
    );

    return {
      path: 'src/app.module.ts',
      content: [
        "import { Module } from '@nestjs/common';",
        "import { TypeOrmModule } from '@nestjs/typeorm';",
        "import { AppController } from './app.controller';",
        ...entityImports,
        ...moduleImports,
        '',
        '@Module({',
        '  imports: [',
        '    TypeOrmModule.forRoot({',
        "      type: 'sqljs',",
        '      autoSave: false,',
        '      synchronize: true,',
        `      entities: [${entityNames.join(', ')}],`,
        '    }),',
        ...moduleNames.map((moduleName) => `    ${moduleName},`),
        '  ],',
        '  controllers: [AppController],',
        '  providers: [],',
        '})',
        'export class AppModule {}',
        '',
      ].join('\n'),
    };
  }

  private crudFeatureFiles(
    spec: AppSpec,
    entity: EntitySpec,
    context?: CodeContext,
  ): GeneratedFile[] {
    const slug = this.toKebabCase(entity.name);
    const className = this.toPascalCase(entity.name);
    const variableName = this.toCamelCase(entity.name);
    const createDto = `Create${className}Dto`;
    const updateDto = `Update${className}Dto`;
    const endpoints = this.entityEndpoints(entity);
    const featureEntities = this.featureEntitiesForAppModule(
      spec,
      entity,
      context,
    );

    return [
      this.appModuleFile(spec.entities, featureEntities),
      {
        path: `src/${slug}/${slug}.module.ts`,
        content: [
          "import { Module } from '@nestjs/common';",
          "import { TypeOrmModule } from '@nestjs/typeorm';",
          `import { ${className} } from './${slug}.entity';`,
          `import { ${className}Controller } from './${slug}.controller';`,
          `import { ${className}Service } from './${slug}.service';`,
          '',
          '@Module({',
          `  imports: [TypeOrmModule.forFeature([${className}])],`,
          `  controllers: [${className}Controller],`,
          `  providers: [${className}Service],`,
          '})',
          `export class ${className}Module {}`,
          '',
        ].join('\n'),
      },
      {
        path: `src/${slug}/${slug}.controller.ts`,
        content: this.controllerFileContent({
          className,
          createDto,
          endpoints,
          slug,
          updateDto,
          variableName,
        }),
      },
      {
        path: `src/${slug}/${slug}.service.ts`,
        content: this.serviceFileContent({
          className,
          createDto,
          endpoints,
          slug,
          updateDto,
        }),
      },
      ...this.dtoFilesForEndpoints(entity, endpoints, createDto, updateDto),
    ];
  }

  private dtoFilesForEndpoints(
    entity: EntitySpec,
    endpoints: EndpointSpec[],
    createDto: string,
    updateDto: string,
  ): GeneratedFile[] {
    const slug = this.toKebabCase(entity.name);
    const dtoImports = this.endpointDtoImports(endpoints, createDto, updateDto);
    return dtoImports.map((dtoName) => ({
      path: `src/${slug}/dto/${this.toKebabCase(dtoName.replace(/Dto$/, ''))}.dto.ts`,
      content: this.dtoFileContent(dtoName, entity, dtoName === updateDto),
    }));
  }

  private controllerFileContent(params: {
    className: string;
    createDto: string;
    endpoints: EndpointSpec[];
    slug: string;
    updateDto: string;
    variableName: string;
  }) {
    const nestImports = new Set(['Controller']);
    const methodImports = new Set<string>();
    const lines: string[] = [];

    for (const endpoint of params.endpoints) {
      methodImports.add(this.httpDecorator(endpoint.method));
      if (this.routeParamNames(endpoint.path).length > 0) {
        nestImports.add('Param');
      }
      if (this.endpointUsesBody(endpoint)) {
        nestImports.add('Body');
      }
    }

    lines.push(
      `import { ${[...nestImports, ...methodImports].sort().join(', ')} } from '@nestjs/common';`,
      "import { ApiTags } from '@nestjs/swagger';",
    );

    const dtoImports = this.endpointDtoImports(
      params.endpoints,
      params.createDto,
      params.updateDto,
    );
    for (const dtoImport of dtoImports) {
      lines.push(
        `import { ${dtoImport} } from './dto/${this.toKebabCase(dtoImport.replace(/Dto$/, ''))}.dto';`,
      );
    }

    lines.push(
      `import { ${params.className}Service } from './${params.slug}.service';`,
      '',
      `@ApiTags('${params.slug}')`,
      '@Controller()',
      `export class ${params.className}Controller {`,
      `  constructor(private readonly ${params.variableName}Service: ${params.className}Service) {}`,
    );

    const methodNames = this.endpointMethodNames(params.endpoints);
    params.endpoints.forEach((endpoint, index) => {
      const decorator = this.httpDecorator(endpoint.method);
      const route = this.controllerRoute(endpoint.path);
      const routeParams = this.routeParamNames(endpoint.path);
      const dtoName = this.endpointDtoName(
        endpoint,
        params.createDto,
        params.updateDto,
      );
      const args = [
        ...routeParams.map(
          (name) => `@Param('${name}') ${this.safeIdentifier(name)}: string`,
        ),
        ...(dtoName ? [`@Body() dto: ${dtoName}`] : []),
      ];
      const serviceArgs = [
        ...routeParams.map((name) => this.safeIdentifier(name)),
        ...(dtoName ? ['dto'] : []),
      ];

      lines.push(
        '',
        `  @${decorator}('${this.escapeSingleQuote(route)}')`,
        `  ${methodNames[index]}(${args.join(', ')}) {`,
        `    return this.${params.variableName}Service.${methodNames[index]}(${serviceArgs.join(', ')});`,
        '  }',
      );
    });

    lines.push('}', '');
    return lines.join('\n');
  }

  private serviceFileContent(params: {
    className: string;
    createDto: string;
    endpoints: EndpointSpec[];
    slug: string;
    updateDto: string;
  }) {
    const needsNotFoundException = params.endpoints.some((endpoint) =>
      this.endpointNeedsLookup(endpoint),
    );
    const nestImports = needsNotFoundException
      ? 'Injectable, NotFoundException'
      : 'Injectable';
    const dtoImports = this.endpointDtoImports(
      params.endpoints,
      params.createDto,
      params.updateDto,
    );
    const lines = [
      `import { ${nestImports} } from '@nestjs/common';`,
      "import { InjectRepository } from '@nestjs/typeorm';",
      "import { Repository } from 'typeorm';",
      ...dtoImports.map(
        (dtoImport) =>
          `import { ${dtoImport} } from './dto/${this.toKebabCase(dtoImport.replace(/Dto$/, ''))}.dto';`,
      ),
      `import { ${params.className} } from './${params.slug}.entity';`,
      '',
      '@Injectable()',
      `export class ${params.className}Service {`,
      '  constructor(',
      `    @InjectRepository(${params.className})`,
      `    private readonly repository: Repository<${params.className}>,`,
      '  ) {}',
    ];

    const methodNames = this.endpointMethodNames(params.endpoints);
    params.endpoints.forEach((endpoint, index) => {
      const routeParams = this.routeParamNames(endpoint.path);
      const dtoName = this.endpointDtoName(
        endpoint,
        params.createDto,
        params.updateDto,
      );
      const args = [
        ...routeParams.map((name) => `${this.safeIdentifier(name)}: string`),
        ...(dtoName ? [`dto: ${dtoName}`] : []),
      ];

      lines.push('', `  async ${methodNames[index]}(${args.join(', ')}) {`);
      lines.push(
        ...this.serviceMethodBody(endpoint, routeParams, params.className),
      );
      lines.push('  }');
    });

    lines.push('}', '');
    return lines.join('\n');
  }

  private serviceMethodBody(
    endpoint: EndpointSpec,
    routeParams: string[],
    className: string,
  ) {
    const method = endpoint.method.toUpperCase();
    const idParam = routeParams.find(
      (name) => this.normalizeName(name) === 'id',
    );
    const whereObject = this.whereObjectLiteral(routeParams);

    if (method === 'GET' && routeParams.length === 0) {
      return ['    return this.repository.find();'];
    }

    if (method === 'GET') {
      return [
        `    const entity = await this.repository.findOne({ where: ${whereObject} as any });`,
        '    if (!entity) {',
        `      throw new NotFoundException('${className} not found');`,
        '    }',
        '    return entity;',
      ];
    }

    if (method === 'DELETE') {
      return [
        `    const entity = await this.repository.findOne({ where: ${whereObject} as any });`,
        '    if (!entity) {',
        `      throw new NotFoundException('${className} not found');`,
        '    }',
        '    await this.repository.remove(entity);',
        `    return { deleted: true${idParam ? `, id: ${this.safeIdentifier(idParam)}` : ''} };`,
      ];
    }

    if (method === 'PUT' || method === 'PATCH') {
      return [
        `    const entity = await this.repository.findOne({ where: ${whereObject} as any });`,
        '    if (!entity) {',
        `      throw new NotFoundException('${className} not found');`,
        '    }',
        '    Object.assign(entity, dto);',
        '    return this.repository.save(entity);',
      ];
    }

    return [
      '    const entity = this.repository.create({',
      '      ...dto,',
      ...routeParams.map((name) => `      ${this.safeIdentifier(name)},`),
      '    } as any);',
      '    return this.repository.save(entity);',
    ];
  }

  private entityEndpoints(entity: EntitySpec): EndpointSpec[] {
    return entity.endpoints.flatMap((endpoint): EndpointSpec[] => {
      const method =
        typeof endpoint.method === 'string'
          ? endpoint.method.toUpperCase()
          : '';
      const path =
        typeof endpoint.path === 'string' ? endpoint.path.trim() : '';
      if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(method) || !path) {
        return [];
      }
      return [
        {
          method,
          path,
          operationName:
            typeof endpoint.operationName === 'string'
              ? endpoint.operationName
              : undefined,
          description:
            typeof endpoint.description === 'string'
              ? endpoint.description
              : undefined,
          requestFields: Array.isArray(endpoint.requestFields)
            ? (endpoint.requestFields as Array<Record<string, unknown>>)
            : [],
          responseFields: Array.isArray(endpoint.responseFields)
            ? (endpoint.responseFields as Array<Record<string, unknown>>)
            : [],
        },
      ];
    });
  }

  private featureEntitiesForAppModule(
    spec: AppSpec,
    currentEntity: EntitySpec,
    context?: CodeContext,
  ) {
    const existingFeatureModules = new Set(
      context?.relevantFiles
        .filter((file) => /^src\/[^/]+\/[^/]+\.module\.ts$/.test(file))
        .map((file) => file.split('/')[1]) ?? [],
    );
    existingFeatureModules.add(this.toKebabCase(currentEntity.name));
    return spec.entities.filter(
      (entity) =>
        entity.endpoints.length > 0 &&
        existingFeatureModules.has(this.toKebabCase(entity.name)),
    );
  }

  private endpointDtoName(
    endpoint: EndpointSpec,
    createDto: string,
    updateDto: string,
  ) {
    if (!this.endpointUsesBody(endpoint)) {
      return undefined;
    }
    return endpoint.method.toUpperCase() === 'POST' ? createDto : updateDto;
  }

  private endpointDtoImports(
    endpoints: EndpointSpec[],
    createDto: string,
    updateDto: string,
  ) {
    return Array.from(
      new Set(
        endpoints
          .map((endpoint) =>
            this.endpointDtoName(endpoint, createDto, updateDto),
          )
          .filter((dtoName): dtoName is string => Boolean(dtoName)),
      ),
    );
  }

  private endpointNeedsLookup(endpoint: EndpointSpec) {
    const method = endpoint.method.toUpperCase();
    return (
      ['GET', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
      this.routeParamNames(endpoint.path).length > 0
    );
  }

  private endpointMethodNames(endpoints: EndpointSpec[]) {
    const used = new Map<string, number>();
    return endpoints.map((endpoint) => {
      const baseName = this.endpointMethodName(endpoint);
      const count = used.get(baseName) ?? 0;
      used.set(baseName, count + 1);
      return count === 0 ? baseName : `${baseName}${count + 1}`;
    });
  }

  private endpointMethodName(endpoint: EndpointSpec) {
    const source =
      endpoint.operationName?.trim() ||
      endpoint.description?.trim() ||
      `${endpoint.method.toLowerCase()} ${endpoint.path}`;
    const words = source.match(/[A-Za-z0-9]+/g) ?? [];
    const normalizedWords =
      words.length > 0
        ? words
        : [
            endpoint.method.toLowerCase(),
            ...endpoint.path.split('/').filter(Boolean),
          ];
    const [first, ...rest] = normalizedWords;
    const methodName = [
      first.toLowerCase(),
      ...rest.map((word) => this.capitalizeIdentifierPart(word)),
    ].join('');

    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(methodName)) {
      return methodName;
    }

    return `handle${this.capitalizeIdentifierPart(this.httpDecorator(endpoint.method))}`;
  }

  private capitalizeIdentifierPart(value: string) {
    const cleaned = value.replace(/[^A-Za-z0-9_$]/g, '');
    if (!cleaned) {
      return '';
    }
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  private endpointUsesBody(endpoint: EndpointSpec) {
    return ['POST', 'PUT', 'PATCH'].includes(endpoint.method.toUpperCase());
  }

  private httpDecorator(method: string) {
    const normalized = method.toUpperCase();
    return normalized.charAt(0) + normalized.slice(1).toLowerCase();
  }

  private controllerRoute(path: string) {
    return path.trim().replace(/^\/+/, '');
  }

  private routeParamNames(path: string) {
    return Array.from(
      path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g),
      (match) => match[1],
    );
  }

  private whereObjectLiteral(routeParams: string[]) {
    if (routeParams.length === 0) {
      return '{}';
    }
    return `{ ${routeParams.map((name) => `${name}: ${this.safeIdentifier(name)}`).join(', ')} }`;
  }

  private safeIdentifier(value: string) {
    const identifier = value.replace(/[^A-Za-z0-9_$]/g, '_');
    return /^[A-Za-z_$]/.test(identifier) ? identifier : `param_${identifier}`;
  }

  private dtoFileContent(
    className: string,
    entity: EntitySpec,
    optional: boolean,
  ) {
    const fields = entity.fields.filter(
      (field) => this.fieldName(field) !== 'id',
    );
    const decoratorImports = new Set<string>();
    const lines = [
      "import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';",
    ];

    for (const field of fields) {
      for (const decorator of this.validatorDecorators(field, optional)) {
        decoratorImports.add(decorator.replace(/\(.+$/, ''));
      }
    }

    if (decoratorImports.size > 0) {
      lines.push(
        `import { ${Array.from(decoratorImports).sort().join(', ')} } from 'class-validator';`,
      );
    }

    lines.push('');
    lines.push(`export class ${className} {`);

    for (const field of fields) {
      const name = this.fieldName(field);
      if (!name) {
        continue;
      }

      lines.push(optional ? '  @ApiPropertyOptional()' : '  @ApiProperty()');
      for (const decorator of this.validatorDecorators(field, optional)) {
        lines.push(`  @${decorator}`);
      }
      lines.push(`  ${name}${optional ? '?' : '!'}: ${this.tsType(field)};`);
      lines.push('');
    }

    lines.push('}');
    lines.push('');
    return lines.join('\n');
  }

  entityDesignPrompt(params: {
    spec: AppSpec;
    existingFiles: GeneratedFile[];
  }): string {
    return [
      'Design all TypeORM entity classes for this NestJS backend before feature implementation starts.',
      'Return JSON shape: {"files":[{"path":"relative/path","content":"complete file content"}]}.',
      'Return complete replacement content for changed files, not snippets.',
      'Generate every entity class in the spec in this single step, so relations can import existing files.',
      'Use TypeORM decorators from "typeorm".',
      'Use definite assignment assertions for entity properties, for example "id!: string".',
      'Use SQL.js TypeORM config in src/app.module.ts via TypeOrmModule.forRoot with type "sqljs", synchronize true, and all generated entities registered.',
      'Do not create controllers, services, DTOs, or feature modules in this entity design step.',
      'Keep the app buildable with npm run build.',
      '',
      'Application spec:',
      JSON.stringify(params.spec, null, 2),
      '',
      'Existing files:',
      JSON.stringify(params.existingFiles, null, 2),
    ].join('\n');
  }

  entityContextHints(entity: EntitySpec): string[] {
    const name = entity.name;
    return [
      `${name.toLowerCase()}`,
      `${this.toKebabCase(name)}`,
      `${this.toPascalCase(name)}Module`,
      `${this.toPascalCase(name)}Controller`,
      `${this.toPascalCase(name)}Service`,
      'AppModule',
      '@Module',
      '@Controller',
      '@Injectable',
    ];
  }

  entityGenerationPrompt(params: {
    spec: AppSpec;
    entity: EntitySpec;
    context: CodeContext;
  }): string {
    return [
      'Implement exactly one NestJS entity feature from the normalized backend spec.',
      'Return JSON shape: {"files":[{"path":"relative/path","content":"complete file content"}]}.',
      'Return complete replacement content for changed files, not snippets.',
      'Use the existing TypeORM entity files from the entity design step.',
      'Do not recreate or remove TypeORM entity relation decorators unless fixing a build error.',
      'Prefer a standard NestJS feature module with module, controller, service, DTOs, and TypeOrmModule.forFeature.',
      'Register the feature module in src/app.module.ts.',
      'Keep code buildable with npm run build.',
      'Do not downgrade package.json dependencies or TypeScript settings.',
      'Do not remove existing working features.',
      '',
      'Entity to implement:',
      JSON.stringify(params.entity, null, 2),
      '',
      'Full application spec:',
      JSON.stringify(params.spec, null, 2),
      '',
      'Code context:',
      JSON.stringify(params.context, null, 2),
    ].join('\n');
  }

  private entityFieldsTask(entity: EntitySpec): BuildTask {
    const slug = this.toKebabCase(entity.name);
    return {
      id: `entity-${slug}-fields`,
      kind: 'entity-fields',
      title: `Create ${entity.name} TypeORM entity fields`,
      description:
        `Create only the ${entity.name} TypeORM entity class with scalar columns. ` +
        'Do not add relation decorators in this task.',
      targetEntity: entity.name,
      dependsOn: [],
      allowedFiles: [`src/${slug}/${slug}.entity.ts`],
      doneCriteria: [
        `${entity.name} entity class exists`,
        'Scalar fields from the spec are represented as TypeORM columns',
        'No imports from not-yet-created related entity files are required',
        'Configured build command passes',
      ],
    };
  }

  private entityRelationsTask(
    entities: EntitySpec[],
    entityFieldTaskIds: string[],
  ): BuildTask {
    return {
      id: 'entity-relations',
      kind: 'entity-relations',
      title: 'Add TypeORM entity relations',
      description:
        'Add TypeORM relation decorators across all generated entity files after scalar entity files exist.',
      dependsOn: entityFieldTaskIds,
      allowedFiles: entities.map((entity) => {
        const slug = this.toKebabCase(entity.name);
        return `src/${slug}/${slug}.entity.ts`;
      }),
      doneCriteria: [
        'Relation decorators match the normalized spec',
        'Related entity imports point to existing generated entity files',
        'Configured build command passes',
      ],
    };
  }

  private ormRegistrationTask(entities: EntitySpec[]): BuildTask {
    const hasRelations = entities.some((entity) => entity.relations.length > 0);
    return {
      id: 'orm-registration',
      kind: 'orm-registration',
      title: 'Register TypeORM infrastructure',
      description:
        'Configure TypeOrmModule.forRoot for local SQL.js execution and register all generated entities.',
      dependsOn: hasRelations
        ? ['entity-relations']
        : entities.map(
            (entity) => `entity-${this.toKebabCase(entity.name)}-fields`,
          ),
      allowedFiles: ['src/app.module.ts', 'package.json', 'tsconfig.json'],
      doneCriteria: [
        'TypeOrmModule.forRoot is configured with type sqljs and synchronize true',
        'All generated entity classes are registered',
        'Required TypeORM dependencies are present in package.json',
        'Configured build command passes',
      ],
    };
  }

  private crudFeatureTask(
    entity: EntitySpec,
    entities: EntitySpec[],
  ): BuildTask {
    const slug = this.toKebabCase(entity.name);
    return {
      id: `feature-${slug}-crud`,
      kind: 'crud-feature',
      title: `Implement ${entity.name} CRUD feature`,
      description: `Implement the ${entity.name} NestJS module, controller, service, DTOs, and repository usage.`,
      targetEntity: entity.name,
      dependsOn: [
        'orm-registration',
        ...(entities.some((candidate) => candidate.relations.length > 0)
          ? ['entity-relations']
          : []),
      ],
      allowedFiles: [
        `src/${slug}/${slug}.module.ts`,
        `src/${slug}/${slug}.controller.ts`,
        `src/${slug}/${slug}.service.ts`,
        `src/${slug}/dto/create-${slug}.dto.ts`,
        `src/${slug}/dto/update-${slug}.dto.ts`,
        'src/app.module.ts',
      ],
      doneCriteria: [
        'Feature module is registered in AppModule',
        'Controller exposes endpoints from the spec',
        'Service uses TypeORM repository for persistence',
        'DTOs use class-validator decorators',
        'Configured build command passes',
      ],
    };
  }

  private businessWorkflowTask(
    entities: EntitySpec[],
    hasRelations: boolean,
  ): BuildTask {
    const featureTaskIds = entities.map(
      (entity) => `feature-${this.toKebabCase(entity.name)}-crud`,
    );

    return {
      id: 'business-transaction-workflows',
      kind: 'business-workflow',
      title: 'Implement cross-entity transactional business workflows',
      description:
        'Implement business endpoints that update multiple entities atomically, especially stock reservation, stock deduction, stock movement audit rows, invoice creation, and payment-to-invoice consistency.',
      dependsOn: [
        'orm-registration',
        ...(hasRelations ? ['entity-relations'] : []),
        ...featureTaskIds,
      ],
      allowedFiles: [
        'src/app.module.ts',
        'src/business-workflows/business-workflows.module.ts',
        'src/business-workflows/business-workflows.controller.ts',
        'src/business-workflows/business-workflows.service.ts',
        'src/business-workflows/dto/receive-purchase-order.dto.ts',
        'src/business-workflows/dto/confirm-sales-order.dto.ts',
        'src/business-workflows/dto/ship-sales-order.dto.ts',
        'src/business-workflows/dto/record-payment.dto.ts',
      ],
      doneCriteria: [
        'Purchase order receive updates PurchaseOrder, PurchaseOrderLine, InventoryBalance, and StockMovement atomically',
        'Sales order confirm reserves InventoryBalance stock atomically and rejects insufficient stock',
        'Sales order ship deducts InventoryBalance stock, creates outbound StockMovement rows, creates Invoice, and updates SalesOrder atomically',
        'Payment creation updates Invoice.amountPaid and Invoice.status atomically',
        'No workflow can partially commit when validation fails',
        'Configured build command passes',
      ],
    };
  }

  private hasBusinessWorkflowRequirements(spec: AppSpec) {
    const entityNames = new Set(
      spec.entities.map((entity) => this.normalizeName(entity.name)),
    );
    const hasSupportedInventoryWorkflowSchema = [
      'InventoryBalance',
      'Invoice',
      'Payment',
      'PurchaseOrder',
      'PurchaseOrderLine',
      'SalesOrder',
      'SalesOrderLine',
      'StockMovement',
    ].every((entityName) => entityNames.has(this.normalizeName(entityName)));

    if (!hasSupportedInventoryWorkflowSchema) {
      return false;
    }

    const searchable = JSON.stringify({
      endpoints: spec.endpoints,
      businessRules: spec.businessRules,
      entityRules: spec.entities.map((entity) => entity.businessRules),
    }).toLowerCase();

    return [
      'transaction',
      'atomically',
      'atomic',
      'inventorybalance',
      'quantityonhand',
      'quantityreserved',
      'stock',
      'reserve',
      'ship',
      'receive',
      'invoice',
      'movement',
    ].some((keyword) => searchable.includes(keyword));
  }

  normalizeGeneratedFiles(files: GeneratedFile[]): GeneratedFile[] {
    return files.map((file) => {
      if (file.path === 'package.json') {
        return {
          ...file,
          content: this.normalizePackageJson(file.content),
        };
      }

      if (file.path === 'tsconfig.json') {
        return {
          ...file,
          content: this.normalizeTsConfig(file.content),
        };
      }

      return file;
    });
  }

  mergeGeneratedFile(params: {
    rootDir: string;
    file: GeneratedFile;
    existingContent?: string;
  }): GeneratedFile {
    if (params.file.path !== 'src/app.module.ts' || !params.existingContent) {
      return params.file;
    }

    return {
      ...params.file,
      content: this.mergeNestAppModule(
        params.existingContent,
        params.file.content,
      ),
    };
  }

  async postProcessAppliedFiles(params: {
    rootDir: string;
    changedFiles: string[];
    workspace: WorkspaceWriter;
  }): Promise<string[]> {
    if (!params.changedFiles.some((file) => file.endsWith('.entity.ts'))) {
      return [];
    }

    const entityFiles = (
      await params.workspace.listFiles(params.rootDir)
    ).filter((file) => file.endsWith('.entity.ts') && file.startsWith('src/'));
    const entities = await Promise.all(
      entityFiles.map(async (filePath) => {
        const absolutePath = params.workspace.resolveInside(
          params.rootDir,
          filePath,
        );
        const content = await params.workspace.readTextFile(absolutePath);
        return this.parseEntityFile(filePath, content);
      }),
    );
    const byClassName = new Map(
      entities.map((entity) => [entity.className, entity]),
    );
    const changed = new Map<string, string>();

    for (const entity of entities) {
      const content = this.ensureUsedTypeOrmDecoratorImports(entity.content);
      if (content !== entity.content) {
        entity.content = content;
        changed.set(entity.filePath, entity.content);
      }
    }

    for (const entity of entities) {
      for (const relation of this.parseOwningRelations(entity.content)) {
        const target = byClassName.get(relation.targetClass);
        if (!target || target.properties.has(relation.inverseProperty)) {
          continue;
        }

        const existingInverse = target.propertyTypes.get(entity.className);
        if (existingInverse) {
          entity.content = entity.content.replace(
            relation.raw,
            relation.raw.replace(
              `.${relation.inverseProperty}`,
              `.${existingInverse}`,
            ),
          );
          changed.set(entity.filePath, entity.content);
          continue;
        }

        if (relation.decorator === 'ManyToOne') {
          target.content = this.ensureTypeOrmDecoratorImport(
            target.content,
            'OneToMany',
          );
          target.content = this.ensureEntityImport(
            target.content,
            entity.className,
            target.filePath,
            entity.filePath,
          );
          target.content = this.insertClassProperty(
            target.content,
            [
              `  @OneToMany(() => ${entity.className}, ${relation.sourceVariable} => ${relation.sourceVariable}.${relation.sourceProperty})`,
              `  ${relation.inverseProperty}!: ${entity.className}[];`,
            ].join('\n'),
          );
          target.properties.add(relation.inverseProperty);
          target.propertyTypes.set(entity.className, relation.inverseProperty);
          changed.set(target.filePath, target.content);
        }
      }
    }

    const changedFiles = Array.from(changed, ([path, content]) => ({
      path,
      content,
    }));
    await params.workspace.writeFiles(params.rootDir, changedFiles);
    return changedFiles.map((file) => file.path);
  }

  installCommands(): CommandSpec[] {
    return [
      {
        command: 'npm',
        args: ['install'],
        description: 'Install Node dependencies',
      },
    ];
  }

  buildCommands(): CommandSpec[] {
    return [
      {
        command: 'npm',
        args: ['run', 'build'],
        description: 'Compile NestJS application',
      },
    ];
  }

  syntaxCheckCommands(): CommandSpec[] {
    return [
      {
        command: 'npm',
        args: ['run', 'build'],
        description: 'Compile NestJS application',
      },
    ];
  }

  e2eCheckCommands(): CommandSpec[] {
    return [
      {
        command: 'npm',
        args: ['run', 'build'],
        description:
          'Fallback E2E gate until generated smoke tests are available',
      },
    ];
  }

  private toKebabCase(value: string) {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  private toPascalCase(value: string) {
    return value
      .replace(/(^|[-_\s]+)([a-zA-Z0-9])/g, (_match, _sep, char: string) =>
        char.toUpperCase(),
      )
      .replace(/[^a-zA-Z0-9]/g, '');
  }

  private toCamelCase(value: string) {
    const pascalCase = this.toPascalCase(value);
    return `${pascalCase.charAt(0).toLowerCase()}${pascalCase.slice(1)}`;
  }

  private normalizeName(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private fieldName(field: Record<string, unknown>) {
    return typeof field.name === 'string' ? field.name.trim() : '';
  }

  private fieldType(field: Record<string, unknown>) {
    return typeof field.type === 'string'
      ? field.type.trim().toLowerCase()
      : 'string';
  }

  private tsType(field: Record<string, unknown>) {
    const type = this.fieldType(field);
    if (
      ['int', 'integer', 'number', 'float', 'decimal', 'double'].includes(type)
    ) {
      return 'number';
    }
    if (['bool', 'boolean'].includes(type)) {
      return 'boolean';
    }
    return 'string';
  }

  private columnOptions(field: Record<string, unknown>) {
    const type = this.fieldType(field);
    const nullable = field.required === false ? ', nullable: true' : '';

    if (type === 'uuid') {
      return `{ type: 'varchar'${nullable} }`;
    }
    if (['int', 'integer'].includes(type)) {
      return `{ type: 'integer'${nullable} }`;
    }
    if (['number', 'float', 'decimal', 'double'].includes(type)) {
      return `{ type: 'float'${nullable} }`;
    }
    if (['bool', 'boolean'].includes(type)) {
      return `{ type: 'boolean'${nullable} }`;
    }
    if (type === 'enum') {
      return `{ type: 'varchar'${nullable} }`;
    }
    return `{ type: 'varchar'${nullable} }`;
  }

  private validatorDecorators(
    field: Record<string, unknown>,
    optional: boolean,
  ) {
    const decorators: string[] = [];
    const type = this.fieldType(field);

    if (optional) {
      decorators.push('IsOptional()');
    } else {
      decorators.push('IsNotEmpty()');
    }

    if (type === 'uuid') {
      decorators.push('IsUUID()');
    } else if (['int', 'integer'].includes(type)) {
      decorators.push('IsInt()');
    } else if (['number', 'float', 'decimal', 'double'].includes(type)) {
      decorators.push('IsNumber()');
    } else if (['bool', 'boolean'].includes(type)) {
      decorators.push('IsBoolean()');
    } else {
      decorators.push('IsString()');
    }

    return decorators;
  }

  private escapeSingleQuote(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private mergeNestAppModule(
    existingContent: string,
    nextContent: string,
  ): string {
    const importDeclarations = Array.from(
      new Set([
        ...this.extractImportDeclarations(existingContent),
        ...this.extractImportDeclarations(nextContent),
      ]),
    ).sort((left, right) => {
      if (left.includes("'@nestjs/common'")) return -1;
      if (right.includes("'@nestjs/common'")) return 1;
      return left.localeCompare(right);
    });

    const moduleImports = this.dedupeModuleImports(
      Array.from(
        new Set([
          ...this.extractModuleArray(existingContent, 'imports'),
          ...this.extractModuleArray(nextContent, 'imports'),
        ]),
      ).filter(Boolean),
    );
    const controllers = Array.from(
      new Set([
        ...this.extractModuleArray(existingContent, 'controllers'),
        ...this.extractModuleArray(nextContent, 'controllers'),
      ]),
    ).filter(Boolean);
    const providers = Array.from(
      new Set([
        ...this.extractModuleArray(existingContent, 'providers'),
        ...this.extractModuleArray(nextContent, 'providers'),
      ]),
    ).filter(Boolean);

    if (moduleImports.length === 0) {
      return nextContent;
    }

    return [
      ...importDeclarations,
      '',
      '@Module({',
      '  imports: [',
      ...moduleImports.map((moduleImport) => `    ${moduleImport},`),
      '  ],',
      ...(controllers.length > 0
        ? [
            '  controllers: [',
            ...controllers.map((controller) => `    ${controller},`),
            '  ],',
          ]
        : []),
      ...(providers.length > 0
        ? [
            '  providers: [',
            ...providers.map((provider) => `    ${provider},`),
            '  ],',
          ]
        : []),
      '})',
      'export class AppModule {}',
      '',
    ].join('\n');
  }

  private extractImportDeclarations(content: string): string[] {
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('import ') && line.endsWith(';'));
  }

  private extractModuleArray(content: string, propertyName: string): string[] {
    const moduleIndex = content.indexOf('@Module');
    if (moduleIndex === -1) {
      return [];
    }

    const propertyMatch = new RegExp(`\\b${propertyName}\\s*:`).exec(
      content.slice(moduleIndex),
    );
    if (!propertyMatch) {
      return [];
    }

    const propertyIndex = moduleIndex + propertyMatch.index;
    const bracketStart = content.indexOf('[', propertyIndex);
    if (bracketStart === -1) {
      return [];
    }

    const bracketEnd = this.findMatchingBracket(content, bracketStart);
    if (bracketEnd === -1) {
      return [];
    }

    return this.splitTopLevelCommaList(
      content.slice(bracketStart + 1, bracketEnd),
    );
  }

  private findMatchingBracket(content: string, bracketStart: number): number {
    let depth = 0;
    for (let index = bracketStart; index < content.length; index += 1) {
      const char = content[index];
      if (char === '[') {
        depth += 1;
      }
      if (char === ']') {
        depth -= 1;
      }
      if (depth === 0) {
        return index;
      }
    }
    return -1;
  }

  private splitTopLevelCommaList(value: string): string[] {
    const items: string[] = [];
    let current = '';
    let depth = 0;
    let quote: string | undefined;

    for (const char of value) {
      if (quote) {
        current += char;
        if (char === quote) {
          quote = undefined;
        }
        continue;
      }

      if (char === "'" || char === '"' || char === '`') {
        quote = char;
        current += char;
        continue;
      }

      if (char === '(' || char === '[' || char === '{') {
        depth += 1;
      }
      if (char === ')' || char === ']' || char === '}') {
        depth -= 1;
      }

      if (char === ',' && depth === 0) {
        const item = current.trim();
        if (item) {
          items.push(item);
        }
        current = '';
        continue;
      }

      current += char;
    }

    const item = current.trim();
    if (item) {
      items.push(item);
    }
    return items;
  }

  private dedupeModuleImports(moduleImports: string[]): string[] {
    const typeOrmForRoot = moduleImports
      .filter((moduleImport) =>
        moduleImport.startsWith('TypeOrmModule.forRoot('),
      )
      .sort((left, right) => right.length - left.length)[0];
    const withoutDuplicateTypeOrmRoot = moduleImports.filter(
      (moduleImport) => !moduleImport.startsWith('TypeOrmModule.forRoot('),
    );

    return typeOrmForRoot
      ? [typeOrmForRoot, ...withoutDuplicateTypeOrmRoot]
      : withoutDuplicateTypeOrmRoot;
  }

  private parseEntityFile(filePath: string, content: string) {
    const className = content.match(/export\s+class\s+(\w+)/)?.[1] ?? '';
    const propertyTypes = new Map<string, string>();
    const properties = new Set<string>();
    const propertyPattern = /^\s*(\w+)[!?]?:\s*([\w\[\]]+)/gm;
    let propertyMatch: RegExpExecArray | null;

    while ((propertyMatch = propertyPattern.exec(content))) {
      const propertyName = propertyMatch[1];
      const propertyType = propertyMatch[2].replace(/\[\]$/, '');
      properties.add(propertyName);
      propertyTypes.set(propertyType, propertyName);
    }

    return {
      filePath,
      content,
      className,
      properties,
      propertyTypes,
    };
  }

  private parseOwningRelations(content: string) {
    const relations: Array<{
      raw: string;
      decorator: 'ManyToOne' | 'OneToOne';
      targetClass: string;
      inverseProperty: string;
      sourceVariable: string;
      sourceProperty: string;
    }> = [];
    const relationPattern =
      /@(ManyToOne|OneToOne)\(\s*\(\)\s*=>\s*(\w+)\s*,\s*(\w+)\s*=>\s*\3\.(\w+)\s*\)\s*\n\s*(\w+)[!?]?:\s*(\w+)/g;
    let relationMatch: RegExpExecArray | null;

    while ((relationMatch = relationPattern.exec(content))) {
      const decorator = relationMatch[1] as 'ManyToOne' | 'OneToOne';
      relations.push({
        raw: relationMatch[0],
        decorator,
        targetClass: relationMatch[2],
        inverseProperty: relationMatch[4],
        sourceVariable: this.toCamelCase(relationMatch[6]),
        sourceProperty: relationMatch[5],
      });
    }

    return relations;
  }

  private ensureTypeOrmDecoratorImport(content: string, decoratorName: string) {
    const importPattern = /import\s+\{([^}]+)\}\s+from\s+['"]typeorm['"];?/;
    const match = content.match(importPattern);
    if (!match) {
      return `import { ${decoratorName} } from 'typeorm';\n${content}`;
    }

    const imports = match[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (imports.includes(decoratorName)) {
      return content;
    }

    return content.replace(
      importPattern,
      `import { ${[...imports, decoratorName].sort().join(', ')} } from 'typeorm';`,
    );
  }

  private ensureUsedTypeOrmDecoratorImports(content: string) {
    return ['ManyToOne', 'OneToMany', 'OneToOne', 'JoinColumn'].reduce(
      (current, decoratorName) =>
        current.includes(`@${decoratorName}`)
          ? this.ensureTypeOrmDecoratorImport(current, decoratorName)
          : current,
      content,
    );
  }

  private ensureEntityImport(
    content: string,
    className: string,
    fromFilePath: string,
    toFilePath: string,
  ) {
    if (new RegExp(`import\\s+\\{\\s*${className}\\s*\\}`).test(content)) {
      return content;
    }

    const fromDir = fromFilePath.split('/').slice(0, -1);
    const toParts = toFilePath.replace(/\.ts$/, '').split('/');
    const toWithoutFile = toParts.slice(0, -1);
    const commonPrefixLength = fromDir.findIndex(
      (part, index) => part !== toWithoutFile[index],
    );
    const sharedLength =
      commonPrefixLength === -1
        ? Math.min(fromDir.length, toWithoutFile.length)
        : commonPrefixLength;
    const upSegments = fromDir.slice(sharedLength).map(() => '..');
    const downSegments = toParts.slice(sharedLength);
    const relativePath = [...upSegments, ...downSegments].join('/');
    const importPath = relativePath.startsWith('.')
      ? relativePath
      : `./${relativePath}`;

    return `import { ${className} } from '${importPath}';\n${content}`;
  }

  private insertClassProperty(content: string, propertyBlock: string) {
    const classEnd = content.lastIndexOf('}');
    if (classEnd === -1) {
      return content;
    }

    return `${content.slice(0, classEnd).trimEnd()}\n\n${propertyBlock}\n${content.slice(classEnd)}`;
  }

  private normalizePackageJson(content: string) {
    const packageJson = this.parseJsonObject(content);
    packageJson.scripts = {
      ...this.asRecord(packageJson.scripts),
      build: 'nest build',
      start: 'node dist/main.js',
    };
    packageJson.dependencies = {
      ...this.asRecord(packageJson.dependencies),
      '@nestjs/common': '^10.4.15',
      '@nestjs/core': '^10.4.15',
      '@nestjs/platform-express': '^10.4.15',
      '@nestjs/swagger': '^7.4.2',
      '@nestjs/typeorm': '^10.0.2',
      'class-transformer': '^0.5.1',
      'class-validator': '^0.14.1',
      'reflect-metadata': '^0.2.2',
      'sql.js': '^1.10.3',
      'swagger-ui-express': '^5.0.1',
      typeorm: '^0.3.20',
      rxjs: '^7.8.1',
    };
    packageJson.devDependencies = {
      ...this.asRecord(packageJson.devDependencies),
      '@nestjs/cli': '^10.4.8',
      '@types/node': '^22.10.2',
      typescript: '^5.7.2',
    };
    return `${JSON.stringify(packageJson, null, 2)}\n`;
  }

  private normalizeTsConfig(content: string) {
    const tsConfig = this.parseJsonObject(content);
    tsConfig.compilerOptions = {
      ...this.asRecord(tsConfig.compilerOptions),
      module: 'Node16',
      target: 'ES2022',
      moduleResolution: 'node16',
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
      skipLibCheck: true,
      strictPropertyInitialization: false,
      outDir: './dist',
      sourceMap: true,
    };
    return `${JSON.stringify(tsConfig, null, 2)}\n`;
  }

  private parseJsonObject(content: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(content) as unknown;
      return this.asRecord(parsed);
    } catch {
      return {};
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }
}
