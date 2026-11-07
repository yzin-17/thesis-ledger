import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type StrategySubmission } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import {
  strategySubmissionInputSchema,
  type StrategySubmissionInput,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { StrategySubmissionExecution } from './strategy-submission-execution.js';

const project = ({ id, kind, state, createdAt, prepared, outcome }: StrategySubmission) => ({
  id,
  kind,
  state,
  createdAt,
  prepared,
  outcome,
});
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
@Injectable()
export class StrategySubmissions {
  private busy = false;
  private timer?: ReturnType<typeof setInterval>;
  private readonly log = new Logger(StrategySubmissions.name);
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(StrategySubmissionExecution) private readonly execution: StrategySubmissionExecution,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const tick = () => void this.run().catch(() => this.log.warn('连续提交队列暂不可用'));
    this.timer = setInterval(tick, 5000);
    this.timer.unref();
    tick();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
  async submit(ownerId: string, id: string, input: StrategySubmissionInput) {
    await this.execution.authorize(ownerId, input);
    await this.db.strategySubmission.createMany({
      skipDuplicates: true,
      data: [{ id, ownerId, kind: input.kind, input: json(input), state: 'queued' }],
    });
    const row = await this.owned(ownerId, id);
    if (!isDeepStrictEqual(row.input, json(input)))
      throw new ConflictException('提交标识已绑定其他配置');
    return project(row);
  }
  async list(ownerId: string) {
    const rows = await this.db.strategySubmission.findMany({
      where: { ownerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    const visible = [];
    for (const row of rows) {
      try {
        await this.execution.authorize(ownerId, strategySubmissionInputSchema.parse(row.input));
      } catch (e) {
        if (e instanceof NotFoundException) continue;
        throw e;
      }
      visible.push(project(row));
    }
    return visible;
  }
  async confirm(ownerId: string, id: string) {
    const row = await this.owned(ownerId, id);
    await this.execution.authorize(ownerId, strategySubmissionInputSchema.parse(row.input));
    if (row.state === 'awaiting_confirmation')
      await this.db.strategySubmission.updateMany({
        where: { id, ownerId, state: row.state, attempt: row.attempt },
        data: { state: 'ready', nextAt: new Date() },
      });
    else if (!['ready', 'creating', 'submitted'].includes(row.state))
      throw new ConflictException('当前准备状态不可确认');
    return project(await this.owned(ownerId, id));
  }
  private async owned(ownerId: string, id: string) {
    const row = await this.db.strategySubmission.findFirst({ where: { id, ownerId } });
    if (!row) throw new NotFoundException('提交不存在或不可访问');
    return row;
  }
  private async recoverCreation(row: StrategySubmission, now: Date) {
    const input = strategySubmissionInputSchema.parse(row.input);
    await this.execution.authorize(row.ownerId, input);
    const key = 'strategy-submit:' + row.id;
    let result: { id: string } | null | undefined;
    if (input.kind === 'optimization') {
      [result] = await this.db.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "OptimizationExperiment" WHERE "idempotencyKey"=${key} LIMIT 1`;
    } else {
      result = await this.db.backtestJob.findFirst({
        where: { idempotencyKey: key, strategyVersionId: input.preparation.strategyVersionId },
        select: { id: true },
      });
    }
    const where = { id: row.id, state: row.state, attempt: row.attempt };
    if (result)
      await this.db.strategySubmission.updateMany({
        where,
        data: { state: 'submitted', outcome: { id: result.id } },
      });
    else
      await this.db.strategySubmission.updateMany({
        where,
        data: {
          state: 'blocked',
          nextAt: new Date(now.getTime() + 3600000),
          outcome: { uncertainCreation: true, reason: '创建回执未确认，后台将核对原任务。' },
        },
      });
  }

  async run(now = new Date()) {
    if (this.busy) return;
    this.busy = true;
    try {
      const rows = await this.db.strategySubmission.findMany({
        where: {
          OR: [
            { state: { in: ['queued', 'preparing', 'ready', 'creating'] } },
            { state: 'blocked', outcome: { path: ['uncertainCreation'], equals: true } },
          ],
          nextAt: { lte: now },
        },
        orderBy: [{ nextAt: 'asc' }, { id: 'asc' }],
        take: 8,
      });
      for (const row of rows) {
        try {
          await this.step(row, now);
        } catch {
          this.log.warn({ operation: 'strategy.submission.recovery', id: row.id });
          await this.db.strategySubmission.updateMany({
            where: { id: row.id, state: row.state, attempt: row.attempt },
            data: { nextAt: new Date(now.getTime() + 3600000) },
          });
        }
      }
    } finally {
      this.busy = false;
    }
  }
  private async step(row: StrategySubmission, now: Date) {
    const original = { id: row.id, state: row.state, attempt: row.attempt };
    if (row.state === 'creating' || row.state === 'blocked') {
      await this.recoverCreation(row, now);
      return;
    }
    if (row.state === 'preparing') {
      // 进程中断后无法证明取数是否发生，不自动再次访问来源。
      await this.db.strategySubmission.updateMany({
        where: original,
        data: { state: 'blocked', outcome: { reason: '准备中断，取数结果未知' } },
      });
      return;
    }
    const preparing = row.state === 'queued';
    const state = preparing ? 'preparing' : 'creating';
    const claim = await this.db.strategySubmission.updateMany({
      where: original,
      data: { state, attempt: { increment: 1 }, nextAt: new Date(now.getTime() + 300000) },
    });
    if (!claim.count) return;
    const write = (data: Prisma.StrategySubmissionUpdateManyMutationInput) =>
      this.db.strategySubmission.updateMany({
        where: { id: row.id, state, attempt: row.attempt + 1 },
        data,
      });
    try {
      const input = strategySubmissionInputSchema.parse(row.input);
      await this.execution.authorize(row.ownerId, input);
      if (preparing) {
        const p = await this.execution.prepare(input);
        if (p.status === 'preparing') {
          if (row.attempt >= 60) throw new BadRequestException('公告准备超时');
          await write({
            state: 'queued',
            nextAt: new Date(Date.now() + 10000),
            outcome: { reason: '正在准备公告资料' },
          });
          return;
        }
        if (p.status === 'blocked') {
          await write({
            state: 'blocked',
            prepared: json(p),
            outcome: { reason: '准备预检未通过', diagnostics: json(p.diagnostics) },
          });
          return;
        }
        await write({
          state: this.execution.requiresConfirmation(input, p) ? 'awaiting_confirmation' : 'ready',
          prepared: json(p),
          nextAt: new Date(),
          outcome: Prisma.DbNull,
        });
      } else {
        const result = await this.execution.create(row.id, input, row.prepared);
        if (!result) throw new Error('创建未返回业务任务');
        await write({ state: 'submitted', outcome: { id: result.id } });
      }
    } catch (e) {
      await write({
        state: 'blocked',
        nextAt: new Date(Date.now() + 3600000),
        outcome: {
          reason: e instanceof Error ? e.message : '准备或创建失败',
          uncertainCreation: state === 'creating' && !(e instanceof HttpException),
        },
      });
    }
  }
}
