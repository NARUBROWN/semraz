import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { BearerAuthGuard } from '../auth/guards/bearer-auth.guard';
import { FeedbackService } from './feedback.service';

type CreateFeedbackBody = {
  page?: string;
  description?: string;
  logs?: string;
  screenshot?: string;
  viewport?: string;
};

@Controller('api/feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @UseGuards(BearerAuthGuard)
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateFeedbackBody) {
    const description = body.description?.trim();

    if (!description) {
      throw new BadRequestException('Description is required.');
    }

    return this.feedbackService.create({
      userId: request.auth!.sub,
      userEmail: request.auth!.email,
      page: body.page ?? '',
      description,
      logs: body.logs ?? null,
      screenshot: body.screenshot ?? null,
      userAgent: request.headers['user-agent'] ?? '',
      viewport: body.viewport ?? '',
    });
  }
}
