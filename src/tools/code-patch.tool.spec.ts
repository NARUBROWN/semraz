import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CodePatchTool } from './code-patch.tool';

describe('CodePatchTool.applyEditPatches', () => {
  let rootDir: string;

  // Minimal WorkspaceWriter stand-in backed by the real filesystem, which is
  // what applyEditPatches reads/writes.
  const workspace = {
    resolveInside: (root: string, relativePath: string) =>
      path.join(root, relativePath),
    writeFiles: async (
      root: string,
      files: Array<{ path: string; content: string }>,
    ) => {
      for (const file of files) {
        const target = path.join(root, file.path);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, file.content);
      }
    },
  };

  const tool = new CodePatchTool(workspace as never);

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-patch-'));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  const write = async (relativePath: string, content: string) => {
    const target = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };

  const read = (relativePath: string) =>
    fs.readFile(path.join(rootDir, relativePath), 'utf8');

  it('applies a unique find/replace edit', async () => {
    await write('a.ts', "import { Test } from '@nestjs/testing';\nconst x = 1;\n");

    const result = await tool.applyEditPatches(rootDir, [
      {
        path: 'a.ts',
        edits: [
          {
            find: "import { Test } from '@nestjs/testing';",
            replace:
              "import { NotFoundException } from '@nestjs/common';\nimport { Test } from '@nestjs/testing';",
          },
        ],
      },
    ]);

    expect(result.applied).toEqual(['a.ts']);
    expect(result.failures).toEqual([]);
    expect(await read('a.ts')).toContain(
      "import { NotFoundException } from '@nestjs/common';",
    );
  });

  it('does not treat $ in the replacement as a special pattern', async () => {
    await write('b.ts', 'const price = OLD;\n');

    await tool.applyEditPatches(rootDir, [
      { path: 'b.ts', edits: [{ find: 'OLD', replace: '"$5.00"' }] },
    ]);

    expect(await read('b.ts')).toBe('const price = "$5.00";\n');
  });

  it('reports a failure and leaves the file untouched when find is missing', async () => {
    await write('c.ts', 'const x = 1;\n');

    const result = await tool.applyEditPatches(rootDir, [
      { path: 'c.ts', edits: [{ find: 'NOT THERE', replace: 'y' }] },
    ]);

    expect(result.applied).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].path).toBe('c.ts');
    expect(result.failures[0].reason).toMatch(/not present/);
    expect(await read('c.ts')).toBe('const x = 1;\n');
  });

  it('reports a failure when find is ambiguous (multiple matches)', async () => {
    await write('d.ts', 'a\na\n');

    const result = await tool.applyEditPatches(rootDir, [
      { path: 'd.ts', edits: [{ find: 'a', replace: 'b' }] },
    ]);

    expect(result.applied).toEqual([]);
    expect(result.failures[0].reason).toMatch(/ambiguous/);
    expect(await read('d.ts')).toBe('a\na\n');
  });

  it('reports a failure when the target file does not exist', async () => {
    const result = await tool.applyEditPatches(rootDir, [
      { path: 'missing.ts', edits: [{ find: 'x', replace: 'y' }] },
    ]);

    expect(result.applied).toEqual([]);
    expect(result.failures[0].reason).toMatch(/does not exist/);
  });

  it('is all-or-nothing per patch: a later failed edit rolls back the file', async () => {
    await write('e.ts', 'keep\nfindme\n');

    const result = await tool.applyEditPatches(rootDir, [
      {
        path: 'e.ts',
        edits: [
          { find: 'findme', replace: 'changed' },
          { find: 'NOPE', replace: 'z' },
        ],
      },
    ]);

    expect(result.applied).toEqual([]);
    expect(result.failures).toHaveLength(1);
    // First edit must not have been written because the second failed.
    expect(await read('e.ts')).toBe('keep\nfindme\n');
  });

  it('rejects a patch the validator rejects, leaving the original file intact', async () => {
    await write('f.ts', 'const x = 1;\n');

    // Validator that flags any content containing "BROKEN".
    const result = await tool.applyEditPatches(
      rootDir,
      [{ path: 'f.ts', edits: [{ find: 'const x = 1;', replace: 'const x = BROKEN(' }] }],
      (_path, content) => (content.includes('BROKEN') ? 'TS1005 syntax error' : undefined),
    );

    expect(result.applied).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toMatch(/would break the file/);
    // The corrupted content must NOT have been written.
    expect(await read('f.ts')).toBe('const x = 1;\n');
  });

  it('applies a patch that passes the validator', async () => {
    await write('g.ts', 'const x = 1;\n');

    const result = await tool.applyEditPatches(
      rootDir,
      [{ path: 'g.ts', edits: [{ find: 'const x = 1;', replace: 'const x = 2;' }] }],
      () => undefined,
    );

    expect(result.applied).toEqual(['g.ts']);
    expect(await read('g.ts')).toBe('const x = 2;\n');
  });
});
