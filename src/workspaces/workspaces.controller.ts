import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { BearerAuthGuard } from '../auth/guards/bearer-auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import type { WorkspaceSnapshotBody } from './dto/workspace.dto';
import { WorkspacesService } from './workspaces.service';

@Controller('api/projects')
@UseGuards(BearerAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.workspacesService.findAll(request.auth!.sub);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: WorkspaceSnapshotBody,
  ) {
    return this.workspacesService.create(request.auth!.sub, body);
  }

  @Patch(':workspaceId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: WorkspaceSnapshotBody,
  ) {
    return this.workspacesService.update(request.auth!.sub, workspaceId, body);
  }

  @Delete(':workspaceId')
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.workspacesService.delete(request.auth!.sub, workspaceId);
  }
}
