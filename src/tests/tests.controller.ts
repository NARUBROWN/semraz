import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { TestRequestDto } from './dto/test-request.dto';
import { TestsService } from './tests.service';

@ApiTags('tests')
@Controller(['api/tests', 'tests'])
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Post()
  @ApiOperation({
    summary: 'Generate and run tests for a generated application',
    description:
      'Runs the LangGraph test generation and verification flow against an existing generated NestJS app.',
  })
  @ApiBody({ type: TestRequestDto })
  @ApiResponse({
    status: 201,
    description: 'The test agent generated tests and attempted verification.',
  })
  @UseGuards(AccessTokenGuard)
  test(@Body() request: TestRequestDto) {
    return this.testsService.test(request);
  }

  @Get('events')
  @UseGuards(AccessTokenGuard)
  async streamTests(
    @Query('appDir') appDir: string,
    @Query('projectDir') projectDir: string | undefined,
    @Query('maxAttempts') maxAttempts: string | undefined,
    @Query('language') language: string | undefined,
    @Res() response: Response,
  ) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();

    let isClosed = false;
    const heartbeat = setInterval(() => {
      if (!isClosed && !response.writableEnded) {
        response.write(': heartbeat\n\n');
      }
    }, 15_000);
    heartbeat.unref();

    response.on('close', () => {
      isClosed = true;
      clearInterval(heartbeat);
    });

    const send = (event: string, data: unknown) => {
      if (isClosed || response.writableEnded) {
        return;
      }

      response.write(
        `event: ${event}\ndata: ${JSON.stringify(localizeTestSseData(data, language))}\n\n`,
      );
    };

    send('progress', {
      stage: 'started',
      message: 'Starting NestJS test agent',
    });

    try {
      const result = await this.testsService.test(
        {
          appDir,
          projectDir,
          maxAttempts: maxAttempts ? Number(maxAttempts) : undefined,
        },
        (progressEvent) => send('progress', progressEvent),
      );
      send('result', result);
      send('done', { ok: true });
    } catch (error) {
      send('agent-error', {
        message:
          error instanceof Error
            ? error.message
            : 'Unexpected NestJS test agent error.',
      });
    } finally {
      clearInterval(heartbeat);
      if (!isClosed && !response.writableEnded) {
        response.end();
      }
    }
  }
}

const koreanTestMessages: Record<string, string> = {
  'Starting NestJS test agent': 'NestJS 테스트 에이전트 시작',
  'Understanding endpoint/function specifications': '엔드포인트/함수 명세 분석',
  'Searching generated NestJS codebase': '생성된 NestJS 코드베이스 검색',
  'Generating framework test code': '프레임워크 테스트 코드 생성',
  'Generating Jest test code': 'Jest 테스트 코드 생성',
  'Applying generated test files': '생성된 테스트 파일 적용',
  'Running test coverage and verification': '테스트 커버리지 및 검증 실행',
  'Generating individual Jest test': '개별 Jest 테스트 생성',
  'Generating individual Jest test details': '개별 Jest 테스트 상세 생성',
  'Applying individual Jest test': '개별 Jest 테스트 적용',
  'Verifying individual Jest test': '개별 Jest 테스트 검증',
  'NestJS test verification completed': 'NestJS 테스트 검증 완료',
  'NestJS test verification failed': 'NestJS 테스트 검증 실패',
};

export function localizeTestSseData(data: unknown, language?: string): unknown {
  if (language !== 'ko' || !data || typeof data !== 'object') {
    return data;
  }

  const payload = data as Record<string, unknown>;
  if (typeof payload.message !== 'string') {
    return data;
  }

  const localizedMessage = koreanTestMessages[payload.message];
  return localizedMessage
    ? { ...payload, message: localizedMessage, messageKey: payload.message }
    : data;
}
