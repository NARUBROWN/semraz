import { AiWizardController } from './ai-wizard.controller';
import { OpenAiJsonClient } from './builds/llm/openai-json.client';
import { DesignConsistencyService } from './design-consistency/design-consistency.service';

describe('AiWizardController Operations generation', () => {
  it('repairs common operation mistakes without making a second LLM call', async () => {
    const generateJson = jest.fn().mockResolvedValue({
      operations: [
        {
          id: 'create_forecast',
          entityId: 'forecast',
          kind: 'crud',
          label: '수확 예상 생성',
          method: 'POST',
          path: '/harvest-forecasts',
          enabled: true,
          payloadFieldIds: [
            'forecast_climate_id',
            'forecast_created_at',
            'forecast_climate_id',
          ],
          requestFieldIds: [
            'forecast_climate_id',
            'forecast_created_at',
            'forecast_climate_id',
          ],
          responseFieldIds: [],
          requestCustomFields: [],
          responseCustomFields: [],
          description: '수확 예상치를 생성합니다.',
          requirements: '',
        },
      ],
    });
    const controller = new AiWizardController(
      { generateJson } as unknown as OpenAiJsonClient,
      new DesignConsistencyService(),
    );

    const result = (await controller.generateWizardDraft(
      { auth: { sub: 'user-id' } } as never,
      {
        step: 'operations',
        language: 'ko',
        project: {
          name: 'Climate API',
          description: '기후 데이터로 수확 예상치를 생성합니다.',
          framework: 'NestJS',
          database: 'PostgreSQL',
          planning: {
            purpose: [
              '- 기후 데이터를 수집합니다.',
              '- 수확 예상치를 생성합니다.',
              '- 예상 결과를 조회합니다.',
            ].join('\n'),
            constraints: 'NestJS와 PostgreSQL을 사용합니다.',
          },
        },
        entities: [
          {
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
            ],
          },
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
      } as never,
    )) as {
      operations: Array<{
        requestFieldIds: string[];
        responseFieldIds: string[];
        requirements: string;
      }>;
    };

    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(result.operations[0].requestFieldIds).toEqual([
      'forecast_climate_id',
      'forecast_yield',
    ]);
    expect(result.operations[0].responseFieldIds).toContain('forecast_id');
    expect(result.operations[0].requirements).toContain('return 404');
  });

  it('repairs an ERD when a Planning capability has no model coverage', async () => {
    const workRequest = {
      id: 'work_request',
      name: 'WorkRequest',
      fields: [
        {
          id: 'work_request_id',
          name: 'id',
          type: 'uuid',
          isPrimaryKey: true,
          isNotNull: true,
        },
      ],
    };
    const notification = {
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
          isPrimaryKey: false,
          isNotNull: true,
        },
      ],
    };
    const generateJson = jest
      .fn()
      .mockResolvedValueOnce({ entities: [workRequest], relations: [] })
      .mockResolvedValueOnce({
        entities: [workRequest, notification],
        relations: [],
      });
    const controller = new AiWizardController(
      { generateJson } as unknown as OpenAiJsonClient,
      new DesignConsistencyService(),
    );

    const result = (await controller.generateWizardDraft(
      { auth: { sub: 'user-id' } } as never,
      {
        step: 'erd',
        language: 'ko',
        project: {
          name: '작업 알림',
          description: '작업 상태 알림을 주민에게 발송합니다.',
          framework: 'NestJS',
          database: 'PostgreSQL',
          planning: {
            purpose: [
              '- 작업 요청을 생성합니다.',
              '- 주민에게 상태 알림을 발송합니다.',
              '- 주민이 알림 내용을 확인합니다.',
            ].join('\n'),
            constraints: 'NestJS와 PostgreSQL을 사용합니다.',
          },
        },
      } as never,
    )) as { entities: Array<{ name: string }> };

    expect(generateJson).toHaveBeenCalledTimes(2);
    expect(result.entities.map((entity) => entity.name)).toContain(
      'Notification',
    );
  });

  it('makes reused LLM field ids globally unique before ERD validation', async () => {
    const generateJson = jest.fn().mockResolvedValue({
      entities: [
        {
          id: 'schedule',
          name: 'Schedule',
          fields: [
            {
              id: 'f1_id',
              name: 'id',
              type: 'uuid',
              isPrimaryKey: true,
              isNotNull: true,
            },
            {
              id: 'f5_created_at',
              name: 'createdAt',
              type: 'datetime',
              isNotNull: true,
            },
          ],
        },
        {
          id: 'record',
          name: 'Record',
          fields: [
            {
              id: 'f1_id',
              name: 'id',
              type: 'uuid',
              isPrimaryKey: true,
              isNotNull: true,
            },
            {
              id: 'f5_created_at',
              name: 'createdAt',
              type: 'datetime',
              isNotNull: true,
            },
          ],
        },
      ],
      relations: [],
    });
    const controller = new AiWizardController(
      { generateJson } as unknown as OpenAiJsonClient,
      new DesignConsistencyService(),
    );

    const result = (await controller.generateWizardDraft(
      { auth: { sub: 'user-id' } } as never,
      {
        step: 'erd',
        language: 'ko',
        project: {
          name: '기록 보관소',
          description: '일정과 결과 기록을 저장합니다.',
          framework: 'NestJS',
          database: 'PostgreSQL',
          planning: {
            purpose: '- 일정 저장\n- 결과 기록 저장\n- 저장된 결과 조회',
            constraints: 'NestJS와 PostgreSQL을 사용합니다.',
          },
        },
      } as never,
    )) as { entities: Array<{ id: string; fields: Array<{ id: string }> }> };

    const ids = result.entities.flatMap((entity) =>
      entity.fields.map((field) => field.id),
    );
    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'schedule_id',
        'schedule_created_at',
        'record_id',
        'record_created_at',
      ]),
    );
  });

  it('keeps one relation when the LLM returns the reverse N-to-1 form', async () => {
    const generateJson = jest.fn().mockResolvedValue({
      entities: [
        {
          id: 'schedule',
          name: 'InspectionSchedule',
          fields: [
            { name: 'id', type: 'uuid', isPrimaryKey: true, isNotNull: true },
          ],
        },
        {
          id: 'result',
          name: 'InspectionResult',
          fields: [
            { name: 'id', type: 'uuid', isPrimaryKey: true, isNotNull: true },
            {
              name: 'inspectionScheduleId',
              type: 'uuid',
              isNotNull: true,
              isForeignKey: true,
              referencesEntityId: 'schedule',
            },
          ],
        },
      ],
      relations: [
        {
          id: 'reverse_relation',
          sourceId: 'result',
          targetId: 'schedule',
          sourceCardinality: 'N',
          targetCardinality: '1',
          direction: 'two-way',
          foreignKeyOwnerId: 'result',
          foreignKeyFieldName: 'inspectionScheduleId',
        },
      ],
    });
    const controller = new AiWizardController(
      { generateJson } as unknown as OpenAiJsonClient,
      new DesignConsistencyService(),
    );

    const result = (await controller.generateWizardDraft(
      { auth: { sub: 'user-id' } } as never,
      {
        step: 'erd',
        language: 'ko',
        project: {
          name: '검사 기록',
          description: '현장 검사 일정과 검사 결과를 관리합니다.',
          framework: 'NestJS',
          database: 'PostgreSQL',
          planning: {
            purpose:
              '- 검사 일정을 등록합니다.\n- 검사 결과를 기록합니다.\n- 검사 결과를 조회합니다.',
            constraints: 'NestJS와 PostgreSQL을 사용합니다.',
          },
        },
      } as never,
    )) as { relations: Array<{ id: string }> };

    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].id).toBe('reverse_relation');
  });

  it('revalidates the current ERD and retries repair with fresh issue logs', async () => {
    const invalidDraft = {
      entities: [
        {
          id: 'duplicate',
          name: 'FirstRecord',
          fields: [{ name: 'id', type: 'uuid', isPrimaryKey: true }],
        },
        {
          id: 'duplicate',
          name: 'SecondRecord',
          fields: [{ name: 'id', type: 'uuid', isPrimaryKey: true }],
        },
      ],
      relations: [],
    };
    const generateJson = jest
      .fn()
      .mockResolvedValueOnce(invalidDraft)
      .mockResolvedValueOnce({
        entities: [
          {
            id: 'record',
            name: 'Record',
            fields: [
              {
                id: 'record_id',
                name: 'id',
                type: 'uuid',
                isPrimaryKey: true,
                isNotNull: true,
              },
            ],
          },
        ],
        relations: [],
      });
    const controller = new AiWizardController(
      { generateJson } as unknown as OpenAiJsonClient,
      new DesignConsistencyService(),
    );

    const result = (await controller.repairWizardDraft(
      { auth: { sub: 'user-id' } } as never,
      {
        step: 'erd',
        language: 'ko',
        project: {
          name: '기록 보관소',
          description: '결과 기록을 저장합니다.',
          framework: 'NestJS',
          database: 'PostgreSQL',
          planning: {
            purpose: '- 결과 생성\n- 결과 저장\n- 저장된 결과 조회',
            constraints: 'NestJS와 PostgreSQL을 사용합니다.',
          },
        },
        draft: invalidDraft,
        issues: [
          {
            code: 'STALE_CLIENT_ISSUE',
            location: 'entities[99]',
            message: 'This issue no longer matches the current draft.',
            suggestion: 'Do not send this stale issue to the model.',
          },
        ],
      } as never,
    )) as { entities: Array<{ name: string }> };

    expect(result.entities[0].name).toBe('Record');
    expect(generateJson).toHaveBeenCalledTimes(2);
    expect(generateJson).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        user: expect.stringContaining('DUPLICATE_ENTITY_ID'),
        context: expect.objectContaining({
          caller: 'ai-wizard:erd-user-repair',
        }),
      }),
    );
    expect(generateJson.mock.calls[0][0].user).not.toContain(
      'STALE_CLIENT_ISSUE',
    );
  });

  it('returns the last rejected ERD draft with its issue log after repair fails', async () => {
    const invalidDraft = {
      entities: [
        {
          id: 'duplicate',
          name: 'FirstRecord',
          fields: [{ name: 'id', type: 'uuid', isPrimaryKey: true }],
        },
        {
          id: 'duplicate',
          name: 'SecondRecord',
          fields: [{ name: 'id', type: 'uuid', isPrimaryKey: true }],
        },
      ],
      relations: [],
    };
    const generateJson = jest.fn().mockResolvedValue(invalidDraft);
    const controller = new AiWizardController(
      { generateJson } as unknown as OpenAiJsonClient,
      new DesignConsistencyService(),
    );

    let response: unknown;
    try {
      await controller.generateWizardDraft(
        { auth: { sub: 'user-id' } } as never,
        {
          step: 'erd',
          language: 'ko',
          project: {
            name: '기록 보관소',
            description: '여러 결과 기록을 저장합니다.',
            framework: 'NestJS',
            database: 'PostgreSQL',
            planning: {
              purpose: '- 결과 생성\n- 결과 저장\n- 저장된 결과 조회',
              constraints: 'NestJS와 PostgreSQL을 사용합니다.',
            },
          },
        } as never,
      );
    } catch (error) {
      response = (error as { getResponse: () => unknown }).getResponse();
    }

    expect(generateJson).toHaveBeenCalledTimes(2);
    expect(response).toEqual(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }),
        ]),
        draft: expect.objectContaining({
          entities: expect.arrayContaining([
            expect.objectContaining({ name: 'FirstRecord' }),
          ]),
        }),
      }),
    );
  });
});
