import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  aiExecutionSummarySchema,
  aiResearchContextSchema,
  researchResultSchema,
  type AiResearchGeneration,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { AiRunService } from './ai-run.service.js';
import { createCoreTools, createResearchTools } from './tool-factory.js';
import { evidenceCitation } from './grounding.js';
import { executeAuditedTool } from './tool-runtime.js';
import { AiProviderRegistry } from './provider-registry.js';
import { PromptVersionRegistry } from './prompt-registry.js';
import { AiExecutionStateStore, type AiExecutionOwnership } from './ai-execution-state.store.js';
import { AiResearchSdkExecution } from './ai-research-sdk-execution.js';

const allowedPermissions = new Set([
  'market:read',
  'portfolio:read',
  'strategy:read',
  'risk:read',
  'journal:read',
] as const);

const researchExecutionEnabled = () => process.env.AI_RESEARCH_EXECUTION_ENABLED !== 'false';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asContext = (value: unknown) => {
  const parsed = aiResearchContextSchema.safeParse(value);
  return parsed.success ? parsed.data : { scope: 'portfolio' as const };
};

const decimalValue = (value: unknown) => {
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toString' in value) {
    const toString = (value as { toString?: () => string }).toString;
    if (toString) return toString.call(value);
  }
  return value;
};

@Injectable()
export class AiResearchExecutor implements OnModuleInit, OnModuleDestroy {
  private readonly active = new Set<string>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly runs: AiRunService,
    private readonly prisma: PrismaService,
    private readonly providers: AiProviderRegistry,
    private readonly prompts: PromptVersionRegistry,
    private readonly executions: AiExecutionStateStore,
    private readonly sdkExecution: AiResearchSdkExecution,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || !researchExecutionEnabled()) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 5_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  dispatch(id: string) {
    if (!researchExecutionEnabled()) return;
    if (this.active.has(id)) return;
    this.active.add(id);
    void this.execute(id)
      .catch(() => undefined)
      .finally(() => this.active.delete(id));
  }

  async tick() {
    if (!researchExecutionEnabled()) return;
    await this.runs.recoverStaleRuns().catch(() => undefined);
    const queued = await this.prisma.aiRun
      .findMany({
        where: { status: 'queued' },
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
            missing: ['AI_BASE_URL、AI_API_KEY、AI_MODEL'],
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

  private toolAdapters() {
    const source = () => new Date().toISOString();
    const contextScope = (input: unknown) => asRecord(input) ?? {};
    const accountWhere = (input: unknown) => {
      const value = contextScope(input);
      return typeof value.accountId === 'string' ? { accountId: value.accountId } : {};
    };

    const getPortfolio = async (input: unknown, signal: AbortSignal) => {
      if (signal.aborted) throw new Error('Tool 调用已取消');
      const accounts = await this.prisma.account.findMany({
        where: { ...accountWhere(input), active: true },
        select: { id: true, name: true, mode: true, currency: true },
        orderBy: { createdAt: 'asc' },
      });
      return {
        sourceId: 'portfolio:accounts',
        provider: 'thesis-ledger',
        fetchedAt: source(),
        accounts,
      };
    };

    const getPositions = async (input: unknown, signal: AbortSignal) => {
      if (signal.aborted) throw new Error('Tool 调用已取消');
      const value = contextScope(input);
      const positions = await this.prisma.position.findMany({
        where: {
          ...accountWhere(input),
          ...(typeof value.symbol === 'string' ? { symbol: value.symbol } : {}),
        },
        select: {
          id: true,
          accountId: true,
          symbol: true,
          quantity: true,
          costPrice: true,
          source: true,
          updatedAt: true,
        },
        orderBy: [{ accountId: 'asc' }, { symbol: 'asc' }],
      });
      return {
        sourceId: 'portfolio:positions',
        provider: 'thesis-ledger',
        fetchedAt: source(),
        positions: positions.map((position) => ({
          ...position,
          quantity: decimalValue(position.quantity),
          costPrice: decimalValue(position.costPrice),
        })),
      };
    };

    const getRisk = async (input: unknown, signal: AbortSignal) => {
      if (signal.aborted) throw new Error('Tool 调用已取消');
      const value = contextScope(input);
      const events = await this.prisma.riskEvent.findMany({
        where: {
          ...accountWhere(input),
          ...(typeof value.symbol === 'string' ? { symbol: value.symbol } : {}),
        },
        select: {
          id: true,
          severity: true,
          message: true,
          mode: true,
          accountId: true,
          symbol: true,
          triggerValue: true,
          threshold: true,
          marketTime: true,
          evaluatedAt: true,
        },
        orderBy: { evaluatedAt: 'desc' },
        take: 100,
      });
      return {
        sourceId: 'risk:events',
        provider: 'thesis-ledger',
        fetchedAt: source(),
        events: events.map((event) => ({
          ...event,
          triggerValue: decimalValue(event.triggerValue),
          threshold: decimalValue(event.threshold),
        })),
      };
    };

    const getJournal = async (input: unknown, signal: AbortSignal) => {
      if (signal.aborted) throw new Error('Tool 调用已取消');
      const value = contextScope(input);
      const entries = await this.prisma.journalEntry.findMany({
        where: {
          ...accountWhere(input),
          ...(typeof value.symbol === 'string' ? { symbol: value.symbol } : {}),
        },
        select: {
          id: true,
          accountId: true,
          symbol: true,
          reason: true,
          content: true,
          risk: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return {
        sourceId: 'journal:entries',
        provider: 'thesis-ledger',
        fetchedAt: source(),
        entries,
      };
    };

    const getStrategyVersion = async (input: unknown, signal: AbortSignal) => {
      if (signal.aborted) throw new Error('Tool 调用已取消');
      const value = contextScope(input);
      const strategyVersionId =
        typeof value.strategyVersionId === 'string' ? value.strategyVersionId : undefined;
      if (!strategyVersionId) throw new Error('策略研究缺少 strategyVersionId');
      const strategyVersion = await this.prisma.strategyVersion.findUnique({
        where: { id: strategyVersionId },
        select: {
          id: true,
          strategyId: true,
          version: true,
          schemaVersion: true,
          schema: true,
          createdAt: true,
          strategy: { select: { name: true, description: true, status: true } },
        },
      });
      if (!strategyVersion) throw new Error(`策略版本不存在: ${strategyVersionId}`);
      return {
        sourceId: `strategy-version:${strategyVersionId}`,
        provider: 'thesis-ledger',
        fetchedAt: source(),
        strategyVersion,
      };
    };

    return { getPortfolio, getPositions, getRisk, getJournal, getStrategyVersion };
  }

  private tools(scope: string = 'portfolio') {
    const adapters = this.toolAdapters();
    if (scope === 'strategy') {
      return [
        {
          name: 'getStrategyVersion',
          permission: 'strategy:read' as const,
          execute: adapters.getStrategyVersion,
        },
      ];
    }
    const tools = [
      ...createCoreTools({
        getPortfolio: adapters.getPortfolio,
        getPositions: adapters.getPositions,
        getRisk: adapters.getRisk,
      }),
      ...createResearchTools({ journal: adapters.getJournal }),
    ];
    if (scope === 'portfolio') return tools.filter((tool) => tool.name !== 'getJournal');
    return tools;
  }

  private startLeaseHeartbeat(ownership: AiExecutionOwnership, deadlineAt: number) {
    const controller = new AbortController();
    const heartbeat = setInterval(() => {
      void this.executions
        .renewLease(ownership, 60_000)
        .then((renewed) => {
          if (!renewed) controller.abort('lease_lost');
        })
        .catch(() => controller.abort('lease_renewal_failed'));
    }, 20_000);
    heartbeat.unref?.();
    const deadline = setTimeout(
      () => controller.abort('deadline_expired'),
      Math.min(2_147_483_647, Math.max(0, deadlineAt - Date.now())),
    );
    deadline.unref?.();
    return {
      signal: controller.signal,
      close: () => {
        clearInterval(heartbeat);
        clearTimeout(deadline);
      },
    };
  }

  private async execute(id: string) {
    const startedAt = Date.now();
    const run = await this.runs.claim(id);
    if (!run) return;
    const ownership = { runId: id, executionAttempt: run.executionAttempt };
    const execution = aiExecutionSummarySchema.safeParse(asRecord(run.modelMetadata)?.sdkExecution);
    if (!execution.success || !execution.data.deadlineAt) {
      await this.executions.failOwned(ownership, {
        errorCode: 'research_policy_missing',
        errorSummary: '研究任务缺少创建时冻结的 SDK 执行策略',
      });
      return;
    }
    const deadlineAt = new Date(execution.data.deadlineAt).getTime();
    const lifecycle = this.startLeaseHeartbeat(ownership, deadlineAt);
    try {
      const prompt = this.prompts.latest('research');
      if (!prompt) throw new Error('缺少 research prompt 注册');
      if (Date.now() >= deadlineAt) throw new Error('研究任务已超过创建时冻结的绝对期限');
      const context = asContext(run.context);
      const input = { context, question: run.question ?? '请基于当前上下文完成研究。' };
      const evidence: Array<{ claim: string; citations: ReturnType<typeof evidenceCitation>[] }> =
        [];
      const successfulCalls: Array<{ tool: string; data: unknown; toolCallId?: string }> = [];
      const toolInput = { ...context };
      const tools = this.tools(context.scope);
      for (const tool of tools) {
        if (lifecycle.signal.aborted || Date.now() >= deadlineAt) break;
        const result = await executeAuditedTool(this.runs, id, tool, toolInput, allowedPermissions);
        if (result.status === 'ok') {
          successfulCalls.push({
            tool: tool.name,
            data: result.data,
            ...(result.toolCallId ? { toolCallId: result.toolCallId } : {}),
          });
          if (result.toolCallId) {
            evidence.push({
              claim: `${tool.name} 返回可追溯的服务端结果。`,
              citations: [evidenceCitation(tool.name, result.data, result.toolCallId)],
            });
          }
        }
      }
      const messages = [
        { role: 'system', content: prompt.template },
        {
          role: 'user',
          content: `请只返回 ResearchResult V1 JSON。RESEARCH_REQUEST_JSON:${JSON.stringify({
            question: input.question,
            context,
            evidence,
            toolResults: successfulCalls.map((call) => ({
              tool: call.tool,
              ...(call.toolCallId ? { toolCallId: call.toolCallId } : {}),
              data: call.data,
            })),
          })}`,
        },
      ];
      const buildResult = (output: AiResearchGeneration, provider: string) => {
        const normalizedEvidence = output.evidence.map((item) => ({
          claim: item.claim,
          citations: item.citations.map((citation) => {
            const matched = successfulCalls.find((call) => {
              if (citation.toolCallId) return call.toolCallId === citation.toolCallId;
              const sourceId = asRecord(call.data)?.sourceId;
              return typeof sourceId === 'string' && sourceId === citation.sourceId;
            });
            if (!matched?.toolCallId)
              throw new Error('研究结论引用了不属于本任务的 Tool call 或来源');
            if (citation.tool && citation.tool !== matched.tool)
              throw new Error('研究结论中的 Tool 引用与审计记录不一致');
            const grounded = evidenceCitation(matched.tool, matched.data, matched.toolCallId);
            if (citation.sourceId && citation.sourceId !== grounded.sourceId)
              throw new Error('研究结论中的来源标识与 Tool 结果不一致');
            return grounded;
          }),
        }));
        return researchResultSchema.parse({
          ...output,
          version: 1,
          provider,
          context,
          evidence: normalizedEvidence,
          createdAt: new Date().toISOString(),
        });
      };
      await this.sdkExecution.execute({
        ownership,
        run,
        messages,
        startedAt,
        signal: lifecycle.signal,
        buildResult,
      });
    } catch (error) {
      const summary = error instanceof Error ? error.message : '研究执行失败';
      const expired = Date.now() >= deadlineAt;
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      let errorCode = this.providers.hasProviders()
        ? 'research_execution_failed'
        : 'provider_unavailable';
      let continuationBlockedReason: 'expired' | 'cancelled' | undefined;
      if (expired) {
        errorCode = 'research_deadline_expired';
        continuationBlockedReason = 'expired';
      } else if (cancelled) {
        errorCode = 'research_cancelled';
        continuationBlockedReason = 'cancelled';
      }
      await this.executions.failOwned(ownership, {
        errorCode,
        errorSummary: summary,
        durationMs: Date.now() - startedAt,
        ...(continuationBlockedReason ? { continuationBlockedReason } : {}),
      });
    } finally {
      lifecycle.close();
    }
  }
}
