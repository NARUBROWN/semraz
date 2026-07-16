import { BuildRunResult, GeneratedFile } from '../types/build.types';

export type RepairDiagnostic = {
  category: 'typescript' | 'contract' | 'openapi' | 'nestjs-di' | 'runtime';
  message: string;
  expectedFix: string;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  excerpt?: string;
};

export function buildRepairDiagnostics(
  failures: BuildRunResult[] | string,
  files: GeneratedFile[],
): RepairDiagnostic[] {
  const raw = Array.isArray(failures)
    ? failures
        .filter((failure) => !failure.success)
        .map((failure) => failure.errorSummary ?? '')
        .join('\n\n')
    : failures;
  const text = stripAnsi(raw);
  const diagnostics: RepairDiagnostic[] = [];
  const seen = new Set<string>();
  const add = (diagnostic: RepairDiagnostic) => {
    const located = diagnostic.file
      ? diagnostic
      : { ...diagnostic, ...locateDiagnosticFile(diagnostic, files) };
    const key = `${located.category}:${located.file ?? ''}:${located.line ?? ''}:${located.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push(withExcerpt(located, files));
  };

  const typescript =
    /(?:^|\n)(src\/[\w./-]+\.ts):(\d+):(\d+)\s+-\s+error\s+(TS\d+):\s*([^\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = typescript.exec(text)) !== null) {
    add({
      category: 'typescript',
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      code: match[4],
      message: match[5].trim(),
      expectedFix: expectedFixFor(match[5], match[4]),
    });
  }

  const fileProblems =
    /(?:^|[;(]\s*)(src\/[\w./-]+\.ts):\s*([^;\n)]+(?:\([^)]*\))?)/g;
  while ((match = fileProblems.exec(text)) !== null) {
    if (/^\d+:\d+\s+-\s+error\s+TS\d+/i.test(match[2].trim())) {
      continue;
    }
    add({
      category: 'contract',
      file: match[1],
      message: match[2].trim(),
      expectedFix: expectedFixFor(match[2]),
    });
  }

  const contractBody = text.match(
    /(?:task contract validation failed|independent task review failed)\s*\(([\s\S]*?)\)(?:\n|$)/i,
  )?.[1];
  for (const problem of contractBody?.split(
    /;\s*(?=(?:src\/|down\(\)|[A-Z]))/,
  ) ?? []) {
    const message = problem.trim();
    if (!message || /^src\//.test(message)) continue;
    add({
      category: 'contract',
      message,
      expectedFix: expectedFixFor(message),
    });
  }

  const knownPatterns: Array<{
    regex: RegExp;
    category: RepairDiagnostic['category'];
  }> = [
    {
      regex: /Missing OpenAPI operation\s+([A-Z]+\s+\/[^\s]+)/g,
      category: 'openapi',
    },
    {
      regex: /([A-Z]+\s+\/[^\s]+) has an empty request schema/g,
      category: 'openapi',
    },
    {
      regex:
        /([A-Z]+\s+\/[^\s]+) (?:request|response) schema is missing\s+([\w]+)/g,
      category: 'openapi',
    },
    {
      regex: /Nest can(?:not|'t) resolve dependencies[^\n]*/gi,
      category: 'nestjs-di',
    },
    {
      regex: /down\(\) must drop the exact foreign-key constraint\s+([\w-]+)/g,
      category: 'contract',
    },
  ];
  for (const pattern of knownPatterns) {
    while ((match = pattern.regex.exec(text)) !== null) {
      add({
        category: pattern.category,
        message: match[0].trim(),
        expectedFix: expectedFixFor(match[0]),
      });
    }
  }

  if (diagnostics.length === 0 && text.trim()) {
    add({
      category: 'runtime',
      message: text.trim().slice(-4000),
      expectedFix:
        '재현된 실패를 제거하는 최소 수정만 적용하고 동일 검증 명령이 통과하는지 확인하세요.',
    });
  }
  return diagnostics;
}

function expectedFixFor(message: string, code?: string) {
  if (code === 'TS2307' || /Cannot find module/i.test(message)) {
    return '실제 존재하는 파일 경로로 import를 수정하거나, 작업 범위에서 반드시 생성해야 하는 누락 파일을 생성하세요.';
  }
  if (/Missing OpenAPI operation/i.test(message)) {
    return '명세의 정확한 HTTP 메서드와 경로를 컨트롤러에 구현하고 해당 모듈을 AppModule에 등록하세요.';
  }
  if (/empty request schema/i.test(message)) {
    return '@Body() DTO를 연결하고 요청 필드에 class-validator 및 @ApiProperty 메타데이터를 선언하세요.';
  }
  if (/schema is missing/i.test(message)) {
    return '명시된 필드를 포함하는 요청/응답 DTO 또는 구체적인 Swagger response schema를 선언하세요.';
  }
  if (/drop the exact foreign-key constraint/i.test(message)) {
    return 'down()에서 테이블을 삭제하기 전에 표시된 이름으로 queryRunner.dropForeignKey를 호출하세요.';
  }
  if (/explicit onDelete policy/i.test(message)) {
    return "해당 파일의 모든 @ManyToOne 및 소유 @OneToOne 옵션에 onDelete를 명시하세요. 별도 삭제 정책이 없으면 onDelete: 'RESTRICT'를 사용하세요.";
  }
  if (/nullable:\s*false|NOT NULL/i.test(message)) {
    return '필수 FK의 소유 관계 옵션과 조인 컬럼에 nullable: false를 유지하세요.';
  }
  if (/resolve dependencies|Repository is unavailable/i.test(message)) {
    return '서비스 생성자 주입과 같은 기능 모듈의 TypeOrmModule.forFeature/providers/imports를 비교해 누락된 provider를 등록하세요.';
  }
  return '검증 메시지에 명시된 계약을 정확히 만족하도록 해당 파일만 최소 수정하세요.';
}

function withExcerpt(
  diagnostic: RepairDiagnostic,
  files: GeneratedFile[],
): RepairDiagnostic {
  if (!diagnostic.file) return diagnostic;
  const file = files.find((candidate) => candidate.path === diagnostic.file);
  if (!file) return diagnostic;
  const lines = file.content.split('\n');
  let center = diagnostic.line ? diagnostic.line - 1 : -1;
  if (center < 0 && /explicit onDelete policy/i.test(diagnostic.message)) {
    center = lines.findIndex((line) => /@(ManyToOne|OneToOne)\s*\(/.test(line));
  }
  if (center < 0) {
    const tokens = Array.from(
      diagnostic.message.matchAll(/[`'"]([A-Za-z_][\w.-]{2,})[`'"]/g),
      (match) => match[1],
    );
    center = lines.findIndex((line) =>
      tokens.some((token) => line.includes(token)),
    );
  }
  if (center < 0) center = 0;
  if (center >= lines.length) center = Math.max(0, lines.length - 1);
  const start = Math.max(0, center - 4);
  const end = Math.min(lines.length, center + 5);
  return {
    ...diagnostic,
    excerpt: lines
      .slice(start, end)
      .map((line, index) => `${start + index + 1}: ${line}`)
      .join('\n'),
  };
}

function locateDiagnosticFile(
  diagnostic: RepairDiagnostic,
  files: GeneratedFile[],
): Pick<RepairDiagnostic, 'file' | 'line'> {
  const find = (predicate: (file: GeneratedFile) => number) => {
    for (const file of files) {
      const line = predicate(file);
      if (line >= 0) return { file: file.path, line: line + 1 };
    }
    return {};
  };

  if (diagnostic.category === 'openapi') {
    const route = diagnostic.message.match(/[A-Z]+\s+\/(\w[\w-]*)/)?.[1];
    if (route) {
      const singular = route.replace(/ies$/, 'y').replace(/s$/, '');
      return find((file) => {
        if (!file.path.endsWith('.controller.ts')) return -1;
        const lines = file.content.split('\n');
        const decoratorLine = lines.findIndex(
          (line) =>
            line.includes(`@Controller('${route}')`) ||
            line.includes(`@Controller(\"${route}\")`),
        );
        return decoratorLine >= 0
          ? decoratorLine
          : file.path.includes(`/${singular}.controller.ts`)
            ? 0
            : -1;
      });
    }
  }

  if (diagnostic.category === 'nestjs-di') {
    const moduleName = diagnostic.message.match(/\b([A-Z]\w+Module)\b/)?.[1];
    if (moduleName) {
      return find((file) => {
        if (!file.path.endsWith('.module.ts')) return -1;
        return file.content
          .split('\n')
          .findIndex((line) => line.includes(moduleName));
      });
    }
  }

  const foreignKey = diagnostic.message.match(
    /foreign-key constraint\s+([\w-]+)/i,
  )?.[1];
  if (foreignKey) {
    return find((file) => {
      if (!/migration/i.test(file.path)) return -1;
      return file.content
        .split('\n')
        .findIndex((line) => line.includes(foreignKey));
    });
  }

  return {};
}

function stripAnsi(value: string) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}
