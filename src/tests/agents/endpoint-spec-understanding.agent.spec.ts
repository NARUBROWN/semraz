import { WorkspaceWriter } from '../../builds/runtime/workspace-writer';
import { EndpointSpecUnderstandingAgent } from './endpoint-spec-understanding.agent';

describe('EndpointSpecUnderstandingAgent', () => {
  it('finds nested case-insensitive docs and accepts common endpoint formats', async () => {
    const files: Record<string, string> = {
      'docs/PROJECT.md': '# Example API\n\nAn example service.\n',
      'docs/ENDPOINTS.md': [
        '## Entity: Widget',
        '### Create widget',
        '- **POST** `/widgets` — creates a widget',
        '#### Request',
        '- `name`: string',
        '',
        '## Widget queries',
        '| Method | Path | Description |',
        '| --- | --- | --- |',
        '| GET | `/widgets/:id` | gets one |',
      ].join('\n'),
      'docs/RULES.md': '# Rules\n- Names are required.\n',
    };
    const workspace = {
      listMarkdownFiles: jest.fn().mockResolvedValue(Object.keys(files)),
      resolveInside: (_root: string, filePath: string) => filePath,
      readTextFile: (filePath: string) => Promise.resolve(files[filePath]),
    } as unknown as WorkspaceWriter;

    const spec = await new EndpointSpecUnderstandingAgent(workspace).understand(
      '/project',
    );

    expect(spec.projectName).toBe('Example API');
    expect(spec.endpoints).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: '/widgets',
        entityName: 'Widget',
      }),
      expect.objectContaining({
        method: 'GET',
        path: '/widgets/:id',
        entityName: 'Widget queries',
      }),
    ]);
    expect(spec.endpoints[0].requestFields).toEqual([
      { name: 'name', type: 'string' },
    ]);
    expect(spec.businessRules).toEqual(['Names are required.']);
  });
});
