import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
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

      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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
