import {
  DesignConsistencyService,
  type DesignContract,
} from './design-consistency.service';

describe('DesignConsistencyService', () => {
  const service = new DesignConsistencyService();

  const climateEntity = {
    id: 'climate',
    name: 'ClimateData',
    fields: [
      {
        id: 'climate_id',
        name: 'id',
        type: 'uuid',
        isPrimaryKey: true,
        isNotNull: true,
      },
      {
        id: 'climate_location',
        name: 'location',
        type: 'string',
        isNotNull: true,
      },
      {
        id: 'climate_created_at',
        name: 'createdAt',
        type: 'datetime',
        isNotNull: true,
      },
    ],
  };

  it('accepts a consistent ERD and operation contract', () => {
    const report = service.validate({
      entities: [climateEntity],
      relations: [],
      operations: [
        {
          entityId: 'climate',
          kind: 'crud',
          label: '기후 데이터 생성',
          method: 'POST',
          path: '/climate-data',
          enabled: true,
          requestFieldIds: ['climate_location'],
          responseFieldIds: ['climate_id', 'climate_created_at'],
          requestCustomFields: [],
          responseCustomFields: [],
          requirements: '',
        },
      ],
    });

    expect(report.valid).toBe(true);
    expect(report.issues.filter((issue) => issue.severity === 'error')).toEqual(
      [],
    );
  });

  it('rejects the contradictions found in the generated climate application', () => {
    const report = service.validate({
      entities: [
        climateEntity,
        {
          id: 'forecast',
          name: 'HarvestForecast',
          fields: [
            {
              id: 'forecast_id',
              name: 'id',
              type: 'uuid',
              isPrimaryKey: true,
              isNotNull: true,
            },
            {
              id: 'forecast_climate_id',
              name: 'climateDataId',
              type: 'uuid',
              isNotNull: true,
              isForeignKey: true,
              referencesEntityId: 'climate',
            },
            {
              id: 'forecast_yield',
              name: 'expectedYield',
              type: 'int',
              isNotNull: true,
            },
            {
              id: 'forecast_created_at',
              name: 'createdAt',
              type: 'datetime',
              isNotNull: true,
            },
          ],
        },
        {
          id: 'report',
          name: 'Report',
          fields: [
            {
              id: 'report_id',
              name: 'id',
              type: 'uuid',
              isPrimaryKey: true,
              isNotNull: true,
            },
            {
              id: 'report_user_id',
              name: 'userId',
              type: 'uuid',
              isNotNull: true,
            },
            {
              id: 'report_content',
              name: 'content',
              type: 'string',
              isNotNull: true,
            },
          ],
        },
      ],
      relations: [
        {
          sourceId: 'climate',
          targetId: 'forecast',
          sourceCardinality: '1',
          targetCardinality: 'N',
          direction: 'two-way',
          foreignKeyOwnerId: 'forecast',
          foreignKeyFieldName: 'climateDataId',
        },
      ],
      operations: [
        {
          entityId: 'forecast',
          kind: 'crud',
          label: '수확 예상 수량 생성',
          method: 'POST',
          path: '/harvest-forecasts',
          enabled: true,
          requestFieldIds: [
            'forecast_climate_id',
            'forecast_created_at',
            'forecast_climate_id',
          ],
          responseFieldIds: ['forecast_id'],
          requestCustomFields: [],
          responseCustomFields: [],
          requirements: 'climateDataId는 존재해야 하며, 404 오류를 반환합니다.',
        },
        {
          entityId: 'report',
          kind: 'crud',
          label: '보고서 생성',
          method: 'POST',
          path: '/reports',
          enabled: true,
          requestFieldIds: ['report_user_id', 'report_content'],
          responseFieldIds: ['report_id'],
          requestCustomFields: [],
          responseCustomFields: [],
          requirements: 'userId는 존재해야 하며, 404 오류를 반환합니다.',
        },
      ],
    });

    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'DUPLICATE_OPERATION_FIELD_ID',
        'SERVER_MANAGED_REQUEST_FIELD',
        'CREATE_REQUIRED_FIELD_MISSING',
        'UNRESOLVABLE_EXISTENCE_REQUIREMENT',
      ]),
    );
    expect(
      report.issues.find(
        (issue) => issue.code === 'CREATE_REQUIRED_FIELD_MISSING',
      )?.message,
    ).toContain('expectedYield');
  });

  it('rejects an FK whose relation and referenced entity do not agree', () => {
    const report = service.validate({
      entities: [
        climateEntity,
        {
          id: 'alert',
          name: 'Alert',
          fields: [
            {
              id: 'alert_id',
              name: 'id',
              type: 'uuid',
              isPrimaryKey: true,
              isNotNull: true,
            },
            {
              id: 'alert_climate_id',
              name: 'climateDataId',
              type: 'uuid',
              isNotNull: true,
              isForeignKey: true,
              referencesEntityId: 'missing',
            },
          ],
        },
      ],
      relations: [],
      operations: [],
    });

    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain(
      'ORPHAN_FOREIGN_KEY',
    );
  });

  it('rechecks contradictions after Markdown has been normalized for code generation', () => {
    const report = service.validateNormalizedSpec({
      entities: [
        {
          name: 'HarvestForecast',
          fields: [
            { name: 'id', type: 'uuid', required: true, primaryKey: true },
            { name: 'climateDataId', type: 'uuid', required: true },
            { name: 'expectedYield', type: 'int', required: true },
            { name: 'createdAt', type: 'datetime', required: true },
          ],
        },
        {
          name: 'Report',
          fields: [
            { name: 'id', type: 'uuid', required: true, primaryKey: true },
            { name: 'userId', type: 'uuid', required: true },
            { name: 'content', type: 'string', required: true },
          ],
        },
      ],
      endpoints: [
        {
          section: 'HarvestForecast',
          operationName: '수확 예상 생성',
          method: 'POST',
          path: '/harvest-forecasts',
          requestFields: [
            { name: 'climateDataId', type: 'uuid' },
            { name: 'createdAt', type: 'datetime' },
            { name: 'climateDataId', type: 'uuid' },
          ],
          responseFields: [{ name: 'id', type: 'uuid' }],
          implementationRequirements:
            'climateDataId가 없으면 404를 반환합니다.',
        },
        {
          section: 'Report',
          operationName: '보고서 생성',
          method: 'POST',
          path: '/reports',
          requestFields: [
            { name: 'userId', type: 'uuid' },
            { name: 'content', type: 'string' },
          ],
          responseFields: [{ name: 'id', type: 'uuid' }],
          implementationRequirements: 'userId가 없으면 404를 반환합니다.',
        },
      ],
    });

    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'DUPLICATE_OPERATION_FIELD_NAME',
        'SERVER_MANAGED_REQUEST_FIELD',
        'CREATE_REQUIRED_FIELD_MISSING',
        'UNRESOLVABLE_EXISTENCE_REQUIREMENT',
      ]),
    );
  });

  it('repairs common LLM operation mistakes without a second LLM call', () => {
    const contract: DesignContract = {
      entities: [
        climateEntity,
        {
          id: 'forecast',
          name: 'HarvestForecast',
          fields: [
            {
              id: 'forecast_id',
              name: 'id',
              type: 'uuid',
              isPrimaryKey: true,
              isNotNull: true,
            },
            {
              id: 'forecast_climate_id',
              name: 'climateDataId',
              type: 'uuid',
              isNotNull: true,
              isForeignKey: true,
              referencesEntityId: 'climate',
            },
            {
              id: 'forecast_yield',
              name: 'expectedYield',
              type: 'int',
              isNotNull: true,
            },
            {
              id: 'forecast_created_at',
              name: 'createdAt',
              type: 'datetime',
              isNotNull: true,
            },
          ],
        },
      ],
      relations: [
        {
          sourceId: 'climate',
          targetId: 'forecast',
          sourceCardinality: '1',
          targetCardinality: 'N',
          direction: 'two-way',
          foreignKeyOwnerId: 'forecast',
          foreignKeyFieldName: 'climateDataId',
        },
      ],
      operations: [
        {
          entityId: 'forecast',
          kind: 'crud',
          label: '수확 예상 생성',
          method: 'POST',
          path: '/harvest-forecasts',
          enabled: true,
          requestFieldIds: [
            'forecast_climate_id',
            'forecast_created_at',
            'forecast_climate_id',
          ],
          responseFieldIds: [],
          requestCustomFields: [
            { name: 'createdAt', type: 'datetime' },
            { name: 'climateDataId', type: 'uuid' },
          ],
          responseCustomFields: [],
          requirements: '',
        },
      ],
    };

    const operations = service.repairOperations(contract);
    const report = service.validate({ ...contract, operations });

    expect(report.valid).toBe(true);
    expect(operations[0].requestFieldIds).toEqual([
      'forecast_climate_id',
      'forecast_yield',
    ]);
    expect(operations[0].responseFieldIds).toContain('forecast_id');
    expect(operations[0].requestCustomFields).toEqual([]);
    expect(operations[0].requirements).toContain('return 404');
  });

  it('removes an invented existence requirement when no target entity exists', () => {
    const reportEntity = {
      id: 'report',
      name: 'Report',
      fields: [
        {
          id: 'report_id',
          name: 'id',
          type: 'uuid',
          isPrimaryKey: true,
          isNotNull: true,
        },
        {
          id: 'report_user_id',
          name: 'userId',
          type: 'uuid',
          isNotNull: true,
        },
      ],
    };
    const contract: DesignContract = {
      entities: [reportEntity],
      relations: [],
      operations: [
        {
          entityId: 'report',
          kind: 'crud',
          label: '보고서 생성',
          method: 'POST',
          path: '/reports',
          enabled: true,
          requestFieldIds: ['report_user_id'],
          responseFieldIds: ['report_id'],
          requestCustomFields: [],
          responseCustomFields: [],
          requirements: 'userId가 없으면 404를 반환합니다.',
        },
      ],
    };

    const operations = service.repairOperations(contract);

    expect(operations[0].requirements).toBe('');
    expect(service.validate({ ...contract, operations }).valid).toBe(true);
  });

  it('detects planning capabilities omitted from the ERD before Operations', () => {
    const report = service.validateTransition('erd', {
      project: {
        name: '공공 작업 관리',
        description:
          '공무원이 작업을 관리하고 주민에게 상태 업데이트를 발송하며 현장 검사를 수행합니다.',
        framework: 'NestJS',
        database: 'PostgreSQL',
        planning: {
          purpose: [
            '- 작업 요청을 생성하고 검토합니다.',
            '- 주민에게 상태 업데이트를 발송합니다.',
            '- 현장 검사를 계획하고 결과를 기록합니다.',
          ].join('\n'),
          constraints: 'NestJS와 PostgreSQL을 사용합니다.',
        },
      },
      entities: [
        {
          id: 'request',
          name: 'WorkRequest',
          fields: [
            {
              id: 'request_id',
              name: 'id',
              type: 'uuid',
              isPrimaryKey: true,
              isNotNull: true,
            },
            {
              id: 'request_status',
              name: 'status',
              type: 'enum',
              isNotNull: true,
            },
          ],
        },
      ],
      relations: [],
    });

    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'ERD_CAPABILITY_NOTIFICATION_MISSING',
        'ERD_CAPABILITY_INSPECTION_MISSING',
      ]),
    );
    expect(report.issues[0].message).toMatch(/[가-힣]/);
  });

  it('accepts capabilities when ERD and Operations both cover them', () => {
    const contract: DesignContract = {
      project: {
        name: '공공 작업 관리',
        description: '주민에게 알림을 발송합니다.',
        framework: 'NestJS',
        database: 'PostgreSQL',
        planning: {
          purpose: [
            '- 작업 요청을 생성합니다.',
            '- 주민 알림을 발송합니다.',
            '- 주민이 알림 내용을 확인합니다.',
          ].join('\n'),
          constraints: 'NestJS와 PostgreSQL을 사용합니다.',
        },
      },
      entities: [
        {
          id: 'notification',
          name: 'Notification',
          fields: [
            {
              id: 'notification_id',
              name: 'id',
              type: 'uuid',
              isPrimaryKey: true,
              isNotNull: true,
            },
            {
              id: 'notification_message',
              name: 'message',
              type: 'string',
              isNotNull: true,
            },
          ],
        },
      ],
      relations: [],
      operations: [
        {
          entityId: 'notification',
          kind: 'crud',
          label: '주민 알림 발송',
          method: 'POST',
          path: '/notifications',
          enabled: true,
          requestFieldIds: ['notification_message'],
          responseFieldIds: ['notification_id'],
          requestCustomFields: [],
          responseCustomFields: [],
          requirements: '',
        },
      ],
    };

    expect(service.validateTransition('operations', contract).valid).toBe(true);
  });

  it('requires every client-owned NN field for PUT while allowing PATCH to be partial', () => {
    const base = {
      entities: [
        {
          name: 'InspectionRecord',
          fields: [
            { name: 'id', type: 'uuid', required: true, primaryKey: true },
            { name: 'inspectionScheduleId', type: 'uuid', required: true },
            { name: 'result', type: 'string', required: true },
            { name: 'entityId', type: 'uuid', required: true },
          ],
        },
      ],
    };
    const putReport = service.validateNormalizedSpec({
      ...base,
      endpoints: [
        {
          section: 'InspectionRecords',
          method: 'PUT',
          path: '/inspection-records/:id',
          requestFields: [
            { name: 'inspectionScheduleId', type: 'uuid' },
            { name: 'result', type: 'string' },
          ],
        },
      ],
    });
    const patchReport = service.validateNormalizedSpec({
      ...base,
      endpoints: [
        {
          section: 'InspectionRecords',
          method: 'PATCH',
          path: '/inspection-records/:id',
          requestFields: [{ name: 'result', type: 'string' }],
        },
      ],
    });

    expect(putReport.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'FULL_UPDATE_REQUIRED_FIELD_MISSING',
          message: expect.stringContaining('entityId'),
        }),
      ]),
    );
    expect(patchReport.valid).toBe(true);
  });

  it('repairs a generated PUT operation before Markdown is written', () => {
    const contract: DesignContract = {
      entities: [
        {
          id: 'inspection-record',
          name: 'InspectionRecord',
          fields: [
            {
              id: 'inspection-record-id',
              name: 'id',
              type: 'uuid',
              isPrimaryKey: true,
              isNotNull: true,
            },
            {
              id: 'inspection-schedule-id',
              name: 'inspectionScheduleId',
              type: 'uuid',
              isNotNull: true,
            },
            {
              id: 'inspection-result',
              name: 'result',
              type: 'string',
              isNotNull: true,
            },
            {
              id: 'inspection-entity-id',
              name: 'entityId',
              type: 'uuid',
              isNotNull: true,
            },
          ],
        },
      ],
      operations: [
        {
          entityId: 'inspection-record',
          kind: 'crud',
          label: '검사 기록 전체 수정',
          method: 'PUT',
          path: '/inspection-records/:id',
          enabled: true,
          requestFieldIds: ['inspection-schedule-id', 'inspection-result'],
          responseFieldIds: [],
        },
      ],
    };

    const operations = service.repairOperations(contract);

    expect(operations[0].requestFieldIds).toEqual([
      'inspection-schedule-id',
      'inspection-result',
      'inspection-entity-id',
    ]);
    expect(service.validate({ ...contract, operations }).valid).toBe(true);
  });

  it('blocks a generic entityId foreign key for a specific relation', () => {
    const report = service.validateTransition('erd', {
      entities: [
        {
          id: 'inspection-schedule',
          name: 'InspectionSchedule',
          fields: [
            {
              id: 'inspection-schedule-id',
              name: 'id',
              type: 'uuid',
              isPrimaryKey: true,
              isNotNull: true,
            },
          ],
        },
        {
          id: 'audit-log',
          name: 'AuditLog',
          fields: [
            {
              id: 'audit-log-id',
              name: 'id',
              type: 'uuid',
              isPrimaryKey: true,
              isNotNull: true,
            },
            {
              id: 'audit-log-entity-id',
              name: 'entityId',
              type: 'uuid',
              isNotNull: true,
              isForeignKey: true,
              referencesEntityId: 'inspection-schedule',
            },
          ],
        },
      ],
      relations: [
        {
          sourceId: 'inspection-schedule',
          targetId: 'audit-log',
          sourceCardinality: '1',
          targetCardinality: 'N',
          direction: 'one-way',
          foreignKeyOwnerId: 'audit-log',
          foreignKeyFieldName: 'entityId',
        },
      ],
    });

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'AMBIGUOUS_FOREIGN_KEY_NAME' }),
      ]),
    );
  });
});
