import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { AiTraceCaptureService } from './trace/ai-trace-capture.service.js';
import { aiExecutionSummarySchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { AiRunService } from './ai-run.service.js';
import { AiProviderRegistry } from './provider-registry.js';
import { AiExecutionStateStore } from './ai-execution-state.store.js';
import { AiResearchSdkExecution } from './ai-research-sdk-execution.js';
import { executeFrozenResearchV2 } from './ai-research-execution-v2.js';
import { researchExecutionDeadline } from './timeout/ai-execution-clock.js';
import {
  createResearchLifecycle,
  researchLifecycleFailure,
} from './timeout/ai-research-lifecycle.js';

const researchExecutionEnabled = () => process.env.AI_RESEARCH_EXECUTION_ENABLED !== 'false';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

@Injectable()
export class AiResearchExecutor implements OnModuleInit, OnModuleDestroy {
  private readonly active = new Set<string>();
  private readonly cancellations = new Map<string, (reason?: unknown) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly runs: AiRunService,
    private readonly prisma: PrismaService,
    private readonly providers: AiProviderRegistry,
    private readonly executions: AiExecutionStateStore,
    private readonly sdkExecution: AiResearchSdkExecution,
    @Optional() private readonly traceCapture?: AiTraceCaptureService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || !researchExecutionEnabled()) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 5_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    for (const cancel of this.cancellations.values()) cancel('worker_shutdown');
  }

  dispatch(id: string) {
    if (!researchExecutionEnabled()) return;
    if (this.active.has(id)) return;
    this.active.add(id);
    void this.execute(id)
      .catch(() => undefined)
      .finally(() => this.active.delete(id));
  }

  /** 调用方先完成身份校验和持久化取消，再尽快中止本进程的传输。 */
  cancelActive(id: string) {
    this.cancellations.get(id)?.();
  }

  async tick() {
    if (!researchExecutionEnabled()) return;
    await this.runs.recoverStaleRuns().catch(() => undefined);
    const queued = await this.prisma.aiRun
      .findMany({
        where: {
          status: 'queued',
          modelMetadata: { path: ['frozenResearch', 'version'], equals: 'research-frozen-input-v1' },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 10,
        select: { id: true },
      })
      .catch(() => []);
    for (const run of queued) this.dispatch(run.id);
  }

  capabilities() {
    const tools = ['getPortfolio', 'getPositions', 'getRisk', 'getJournal', 'getStrategyVersion'];
    const configured = this.providers.list();
    const providers = configured.length
      ? configured.map((provider) => {
          let state: 'available' | 'demo' | 'error' = 'available';
          if (provider.id === 'fixture') state = 'demo';
          else if (provider.metadata?.health === 'down') state = 'error';
          const impact = state === 'demo' ? ['结果为演示数据，不构成投资建议。'] : [];
          if (state === 'error') impact.push('Provider 健康检查失败，研究任务可能无法完成。');
          return {
            provider: provider.id,
            state,
            models: provider.models,
            tools,
            missing: [],
            impact,
          };
        })
      : [
          {
            provider: 'none',
            state: 'unconfigured' as const,
            models: [],
            tools,
            missing: ['请在 Provider 设置页配置 AI 服务、模型与执行路由'],
            impact: ['研究任务会进入失败状态，并明确提示 Provider 未配置。'],
          },
        ];
    return {
      canStart: providers.some(
        (provider) => provider.state === 'available' || provider.state === 'demo',
      ),
      providers,
      checkedAt: new Date().toISOString(),
    };
  }

  private async execute(id: string) {
    const startedAt = Date.now();
    const run = await this.runs.claim(id);
    if (!run) return;
    const execute = () => this.executeClaimed(run, startedAt);
    if (this.traceCapture) return this.traceCapture.runClaimed(run, execute);
    return execute();
  }

  private async executeClaimed(
    run: NonNullable<Awaited<ReturnType<AiRunService['claim']>>>,
    startedAt: number,
  ) {
    const id = run.id;
    const ownership = { runId: id, executionAttempt: run.executionAttempt };
    const execution = aiExecutionSummarySchema.safeParse(asRecord(run.modelMetadata)?.sdkExecution);
    if (!execution.success || !execution.data.frozenPolicy || !execution.data.deadlineAt) {
      await this.executions.failOwned(ownership, {
        errorCode: 'research_policy_missing',
        errorSummary: '研究任务缺少创建时冻结的 SDK 执行策略',
      });
      return;
    }
    const deadlineAt = researchExecutionDeadline(execution.data);
    const lifecycle = createResearchLifecycle(this.executions, ownership, execution.data);
    this.cancellations.set(id, lifecycle.cancel);
    try {
      lifecycle.assertActive();
      const frozen = asRecord(run.modelMetadata)?.frozenResearch;
      await executeFrozenResearchV2({
        run, raw: frozen, ownership, runs: this.runs, sdk: this.sdkExecution,
        signal: lifecycle.signal, deadlineAt, startedAt,
      });
    } catch (error) {
      await this.executions.failOwned(ownership, {
        ...researchLifecycleFailure(error, lifecycle.signal, this.providers.hasProviders()),
        durationMs: Date.now() - startedAt,
      });
    } finally {
      this.cancellations.delete(id);
      lifecycle.close();
    }
  }
}
