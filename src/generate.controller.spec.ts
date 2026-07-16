import { buildErdMarkdown } from './generate.controller';

describe('buildErdMarkdown', () => {
  it('writes entity names as FK references without an extra table column', () => {
    const markdown = buildErdMarkdown({
      entities: [
        {
          id: 'building-internal-id',
          name: 'Building',
          fields: [
            {
              id: 'building-id',
              name: 'id',
              type: 'uuid',
              isPrimaryKey: true,
              isNotNull: true,
            },
          ],
        },
        {
          id: 'schedule-internal-id',
          name: 'InspectionSchedule',
          fields: [
            {
              id: 'schedule-building-id',
              name: 'buildingId',
              type: 'uuid',
              isNotNull: true,
              isForeignKey: true,
              referencesEntityId: 'building-internal-id',
            },
          ],
        },
      ],
      relations: [],
    });

    expect(markdown).toContain(
      '| buildingId | uuid | no | yes | yes | Building |',
    );
    expect(markdown).not.toContain('building-internal-id');
    expect(markdown).not.toContain('| Building | |');
  });
});
