import {
  Controller,
  Delete,
  Get,
  Post,
  Body,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { FeedbackService } from '../feedback/feedback.service';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly feedbackService: FeedbackService,
  ) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.adminService.login(body.email, body.password);
  }

  @Get('dashboard')
  @UseGuards(AdminGuard)
  getDashboard() {
    return this.adminService.getDashboardOverview();
  }

  @Get('users')
  @UseGuards(AdminGuard)
  getUsers() {
    return this.adminService.getUsersWithWorkspaces();
  }

  @Get('workspaces')
  @UseGuards(AdminGuard)
  getWorkspaces() {
    return this.adminService.getWorkspaceUsage();
  }

  @Get('llm-calls')
  @UseGuards(AdminGuard)
  getRecentCalls() {
    return this.adminService.getRecentLlmCalls();
  }

  @Post('users/:id/block')
  @UseGuards(AdminGuard)
  blockUser(@Param('id') id: string) {
    return this.adminService.setUserStatus(id, 'blocked');
  }

  @Post('users/:id/unblock')
  @UseGuards(AdminGuard)
  unblockUser(@Param('id') id: string) {
    return this.adminService.setUserStatus(id, 'active');
  }

  @Delete('users/:id')
  @UseGuards(AdminGuard)
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  @Get('feedback')
  @UseGuards(AdminGuard)
  getFeedbacks() {
    return this.feedbackService.findAll();
  }

  @Get('feedback/:id/screenshot')
  @UseGuards(AdminGuard)
  async getFeedbackScreenshot(@Param('id') id: string, @Res() res: Response) {
    const { buffer, mime } = await this.feedbackService.getScreenshot(id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  }
}
