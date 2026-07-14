import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { LlmUsageLog } from '../builds/llm/llm-usage-log.entity';
import { FeedbackModule } from '../feedback/feedback.module';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Workspace, LlmUsageLog]),
    AuthModule,
    FeedbackModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
