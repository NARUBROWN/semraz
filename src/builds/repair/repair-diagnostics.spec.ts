import { buildRepairDiagnostics } from './repair-diagnostics';

describe('buildRepairDiagnostics', () => {
  it('extracts a TypeScript location and numbered source excerpt', () => {
    const diagnostics = buildRepairDiagnostics(
      "src/app.module.ts:8:38 - error TS2307: Cannot find module './inspection/inspection.controller'",
      [
        {
          path: 'src/app.module.ts',
          content: [
            "import { Module } from '@nestjs/common';",
            "import { InspectionController } from './inspection/inspection.controller';",
          ].join('\n'),
        },
      ],
    );

    expect(diagnostics[0]).toEqual(
      expect.objectContaining({
        category: 'typescript',
        file: 'src/app.module.ts',
        line: 8,
        column: 38,
        code: 'TS2307',
      }),
    );
    expect(diagnostics[0].excerpt).toContain('2: import');
  });

  it('turns migration and OpenAPI failures into explicit expected fixes', () => {
    const diagnostics = buildRepairDiagnostics(
      [
        'task contract validation failed (down() must drop the exact foreign-key constraint FK_audit_logs_inspection_id)',
        'Error: POST /inspections has an empty request schema',
      ].join('\n'),
      [
        {
          path: 'src/inspection/inspection.controller.ts',
          content: [
            "import { Controller } from '@nestjs/common';",
            "@Controller('inspections')",
            'export class InspectionController {}',
          ].join('\n'),
        },
      ],
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('FK_audit_logs_inspection_id'),
          expectedFix: expect.stringContaining('dropForeignKey'),
        }),
        expect.objectContaining({
          category: 'openapi',
          file: 'src/inspection/inspection.controller.ts',
          line: 2,
          excerpt: expect.stringContaining("@Controller('inspections')"),
          expectedFix: expect.stringContaining('@Body() DTO'),
        }),
      ]),
    );
  });
});
