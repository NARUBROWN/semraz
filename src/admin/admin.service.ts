import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { User } from '../auth/entities/user.entity';
import { LlmUsageLog } from '../builds/llm/llm-usage-log.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';

const MODEL_PRICING_USD_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.0 },
  'gpt-4o-2024-08-06': { input: 2.50, output: 10.0 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
};

const USD_TO_KRW = 1380;

function calcCostKrw(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING_USD_PER_1M[model] ?? MODEL_PRICING_USD_PER_1M['gpt-4o-mini'];
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * USD_TO_KRW * 100) / 100;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(LlmUsageLog)
    private readonly usageRepo: Repository<LlmUsageLog>,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Authenticates an admin with real credentials (User table + bcrypt + JWT),
   * then authorizes on the `admin` role. Emails listed in the ADMIN_EMAILS env
   * allowlist are promoted to admin on successful login, which bootstraps the
   * first admin without a database console.
   */
  async login(email: string, password: string) {
    const normalizedEmail = email?.trim().toLowerCase() ?? '';

    // Promote before issuing tokens so the returned user + access token carry the admin role.
    await this.promoteAllowlistedAdmin(normalizedEmail);

    const auth = await this.authService.login({ email, password });

    if (auth.user.role !== 'admin') {
      throw new ForbiddenException('Admin access is required.');
    }

    return {
      token: auth.accessToken,
      refreshToken: auth.refreshToken,
      user: auth.user,
    };
  }

  /** Guards admin-only endpoints: the account must exist, be active, and hold the admin role. */
  async assertAdmin(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (user.status === 'blocked') {
      throw new ForbiddenException('This account has been blocked.');
    }

    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin access is required.');
    }
  }

  private async promoteAllowlistedAdmin(email: string) {
    if (!email || !this.getAdminEmails().includes(email)) {
      return;
    }

    const user = await this.userRepo.findOne({
      where: { email },
      select: { id: true, role: true },
    });

    if (user && user.role !== 'admin') {
      await this.userRepo.update({ id: user.id }, { role: 'admin' });
    }
  }

  private getAdminEmails(): string[] {
    return (this.configService.get<string>('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  }

  async getDashboardOverview() {
    const [totalUsers, totalWorkspaces, totalLlmCalls] = await Promise.all([
      this.userRepo.count(),
      this.workspaceRepo.count(),
      this.usageRepo.count(),
    ]);

    const tokenSums = await this.usageRepo
      .createQueryBuilder('log')
      .select('COALESCE(SUM(log.prompt_tokens), 0)', 'totalPromptTokens')
      .addSelect('COALESCE(SUM(log.completion_tokens), 0)', 'totalCompletionTokens')
      .addSelect('COALESCE(SUM(log.total_tokens), 0)', 'totalTokens')
      .addSelect('COALESCE(AVG(log.duration_ms), 0)', 'avgDurationMs')
      .getRawOne();

    const allLogs = await this.usageRepo.find({ select: { model: true, promptTokens: true, completionTokens: true } });
    const totalCostKrw = allLogs.reduce(
      (sum, log) => sum + calcCostKrw(log.model, log.promptTokens, log.completionTokens),
      0,
    );

    const dailyUsage = await this.usageRepo
      .createQueryBuilder('log')
      .select('DATE(log.created_at)', 'date')
      .addSelect('COUNT(*)', 'calls')
      .addSelect('SUM(log.total_tokens)', 'tokens')
      .groupBy('DATE(log.created_at)')
      .orderBy('DATE(log.created_at)', 'DESC')
      .limit(30)
      .getRawMany();

    const usageByModel = await this.usageRepo
      .createQueryBuilder('log')
      .select('log.model', 'model')
      .addSelect('COUNT(*)', 'calls')
      .addSelect('SUM(log.prompt_tokens)', 'promptTokens')
      .addSelect('SUM(log.completion_tokens)', 'completionTokens')
      .addSelect('SUM(log.total_tokens)', 'totalTokens')
      .groupBy('log.model')
      .orderBy('SUM(log.total_tokens)', 'DESC')
      .getRawMany();

    const usageByCaller = await this.usageRepo
      .createQueryBuilder('log')
      .select('log.caller', 'caller')
      .addSelect('COUNT(*)', 'calls')
      .addSelect('SUM(log.total_tokens)', 'tokens')
      .groupBy('log.caller')
      .orderBy('SUM(log.total_tokens)', 'DESC')
      .getRawMany();

    return {
      totalUsers,
      totalWorkspaces,
      totalLlmCalls,
      totalPromptTokens: Number(tokenSums?.totalPromptTokens ?? 0),
      totalCompletionTokens: Number(tokenSums?.totalCompletionTokens ?? 0),
      totalTokens: Number(tokenSums?.totalTokens ?? 0),
      totalCostKrw: Math.round(totalCostKrw * 100) / 100,
      avgDurationMs: Math.round(Number(tokenSums?.avgDurationMs ?? 0)),
      dailyUsage: dailyUsage.map((row) => ({
        date: row.date,
        calls: Number(row.calls),
        tokens: Number(row.tokens),
      })),
      usageByModel: usageByModel.map((row) => {
        const promptTokens = Number(row.promptTokens);
        const completionTokens = Number(row.completionTokens);
        return {
          model: row.model,
          calls: Number(row.calls),
          totalTokens: Number(row.totalTokens),
          costKrw: calcCostKrw(row.model, promptTokens, completionTokens),
        };
      }),
      usageByCaller: usageByCaller.map((row) => ({
        caller: row.caller,
        calls: Number(row.calls),
        tokens: Number(row.tokens),
      })),
    };
  }

  async getUsersWithWorkspaces() {
    const users = await this.userRepo.find({
      order: { createdAt: 'DESC' },
    });

    const workspaceCounts = await this.workspaceRepo
      .createQueryBuilder('ws')
      .select('ws.owner_id', 'ownerId')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN ws.status = :planning THEN 1 ELSE 0 END)', 'planning')
      .addSelect('SUM(CASE WHEN ws.status = :verified THEN 1 ELSE 0 END)', 'verified')
      .addSelect('SUM(CASE WHEN ws.status = :failed THEN 1 ELSE 0 END)', 'compileFailed')
      .setParameters({ planning: 'planning', verified: 'verified', failed: 'compile_failed' })
      .groupBy('ws.owner_id')
      .getRawMany();

    const countMap = new Map(
      workspaceCounts.map((row) => [
        row.ownerId,
        {
          total: Number(row.total),
          planning: Number(row.planning),
          verified: Number(row.verified),
          compileFailed: Number(row.compileFailed),
        },
      ]),
    );

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      workspaces: countMap.get(user.id) ?? { total: 0, planning: 0, verified: 0, compileFailed: 0 },
    }));
  }

  async setUserStatus(userId: string, status: 'active' | 'blocked') {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.status = status;
    await this.userRepo.save(user);

    return { id: user.id, status: user.status };
  }

  async deleteUser(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Sessions, workspaces, and signup events cascade on the User FK.
    // LLM usage logs keep their userId column (no FK) as an audit trail.
    await this.userRepo.remove(user);

    return { id: userId, deleted: true };
  }

  async getWorkspaceUsage() {
    const workspaces = await this.workspaceRepo.find({
      relations: { owner: true },
      order: { createdAt: 'DESC' },
    });

    const allWsLogs = await this.usageRepo
      .createQueryBuilder('log')
      .select(['log.workspaceId', 'log.model', 'log.promptTokens', 'log.completionTokens', 'log.totalTokens'])
      .where('log.workspace_id IS NOT NULL')
      .getMany();

    const usageMap = new Map<string, { calls: number; promptTokens: number; completionTokens: number; totalTokens: number; costKrw: number }>();
    for (const log of allWsLogs) {
      const wsId = log.workspaceId!;
      const entry = usageMap.get(wsId) ?? { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costKrw: 0 };
      entry.calls += 1;
      entry.promptTokens += log.promptTokens;
      entry.completionTokens += log.completionTokens;
      entry.totalTokens += log.totalTokens;
      entry.costKrw += calcCostKrw(log.model, log.promptTokens, log.completionTokens);
      usageMap.set(wsId, entry);
    }

    return workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      ownerName: ws.owner?.name ?? 'Unknown',
      ownerEmail: ws.owner?.email ?? '',
      status: ws.status,
      currentStep: ws.currentStep,
      entitiesCount: ws.entitiesCount,
      operationsCount: ws.operationsCount,
      generationWorkspaceId: ws.generationWorkspaceId,
      createdAt: ws.createdAt,
      usage:
        (ws.generationWorkspaceId ? usageMap.get(ws.generationWorkspaceId) : undefined) ??
        { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costKrw: 0 },
    }));
  }

  async getRecentLlmCalls(limit = 50) {
    const logs = await this.usageRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });

    // Resolve which user each call belongs to: directly via userId (wizard calls)
    // or indirectly via the workspace owner (build/test calls store a workspaceId).
    const workspaceIds = [
      ...new Set(logs.map((log) => log.workspaceId).filter((id): id is string => Boolean(id))),
    ];
    const workspaces = workspaceIds.length
      ? await this.workspaceRepo.find({
          where: { generationWorkspaceId: In(workspaceIds) },
          select: { generationWorkspaceId: true, ownerId: true },
        })
      : [];
    const workspaceOwner = new Map(
      workspaces.map((ws) => [ws.generationWorkspaceId as string, ws.ownerId]),
    );

    const userIds = [
      ...new Set([
        ...logs.map((log) => log.userId).filter((id): id is string => Boolean(id)),
        ...workspaceOwner.values(),
      ]),
    ];
    const users = userIds.length
      ? await this.userRepo.find({
          where: { id: In(userIds) },
          select: { id: true, name: true, email: true, status: true },
        })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));

    return logs.map((log) => {
      const resolvedUserId =
        log.userId ?? (log.workspaceId ? workspaceOwner.get(log.workspaceId) : undefined) ?? null;
      const user = resolvedUserId ? userById.get(resolvedUserId) : undefined;

      return {
        ...log,
        costKrw: calcCostKrw(log.model, log.promptTokens, log.completionTokens),
        userId: resolvedUserId,
        userName: user?.name ?? null,
        userEmail: user?.email ?? null,
        userStatus: user?.status ?? null,
      };
    });
  }
}
