import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Feedback } from './entities/feedback.entity';
import { currentLogPosition, getServerLogWindow } from './server-log-buffer';

// How much server-log context to keep around the feedback moment.
const SERVER_LOG_LINES_BEFORE = 20;
const SERVER_LOG_LINES_AFTER = 20;
// Brief pause so log lines emitted right after the request land in the window.
const SERVER_LOG_AFTER_WAIT_MS = 600;

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

export type CreateFeedbackInput = {
  userId: string;
  userEmail: string;
  page: string;
  description: string;
  logs?: string | null;
  screenshot?: string | null;
  userAgent?: string;
  viewport?: string;
};

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepo: Repository<Feedback>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(input: CreateFeedbackInput) {
    // Anchor the server-log window at "now", then wait briefly so lines emitted
    // just after the submission are included alongside the preceding context.
    const logAnchor = currentLogPosition();
    await new Promise((resolve) => setTimeout(resolve, SERVER_LOG_AFTER_WAIT_MS));
    const serverLogs = getServerLogWindow(
      logAnchor,
      SERVER_LOG_LINES_BEFORE,
      SERVER_LOG_LINES_AFTER,
    );

    const { buffer, mime } = this.decodeScreenshot(input.screenshot);
    const user = await this.userRepo.findOne({ where: { id: input.userId } });

    const feedback = this.feedbackRepo.create({
      userId: input.userId,
      userEmail: user?.email ?? input.userEmail,
      userName: user?.name ?? '',
      page: input.page.slice(0, 500),
      description: input.description,
      logs: input.logs ?? null,
      serverLogs: serverLogs || null,
      screenshot: buffer,
      screenshotMime: mime,
      userAgent: (input.userAgent ?? '').slice(0, 300),
      viewport: (input.viewport ?? '').slice(0, 50),
    });

    const saved = await this.feedbackRepo.save(feedback);

    return { id: saved.id, createdAt: saved.createdAt };
  }

  async findAll() {
    const feedbacks = await this.feedbackRepo
      .createQueryBuilder('feedback')
      .select([
        'feedback.id AS id',
        'feedback.user_id AS userId',
        'feedback.user_email AS userEmail',
        'feedback.user_name AS userName',
        'feedback.page AS page',
        'feedback.description AS description',
        'feedback.logs AS logs',
        'feedback.server_logs AS serverLogs',
        'feedback.user_agent AS userAgent',
        'feedback.viewport AS viewport',
        'feedback.created_at AS createdAt',
        'CASE WHEN feedback.screenshot IS NULL THEN 0 ELSE 1 END AS hasScreenshot',
      ])
      .orderBy('feedback.created_at', 'DESC')
      .getRawMany();

    return feedbacks.map((row) => ({
      ...row,
      hasScreenshot: Number(row.hasScreenshot) === 1,
    }));
  }

  async getScreenshot(id: string) {
    const feedback = await this.feedbackRepo.findOne({
      where: { id },
      select: { id: true, screenshot: true, screenshotMime: true },
    });

    if (!feedback?.screenshot) {
      throw new NotFoundException('Screenshot not found.');
    }

    return { buffer: feedback.screenshot, mime: feedback.screenshotMime };
  }

  private decodeScreenshot(dataUrl?: string | null): {
    buffer: Buffer | null;
    mime: string;
  } {
    if (!dataUrl) {
      return { buffer: null, mime: 'image/jpeg' };
    }

    const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);

    if (!match) {
      throw new BadRequestException('Screenshot must be a base64 image data URL.');
    }

    const buffer = Buffer.from(match[2], 'base64');

    if (buffer.length > MAX_SCREENSHOT_BYTES) {
      throw new BadRequestException('Screenshot is too large.');
    }

    return { buffer, mime: match[1] };
  }
}
