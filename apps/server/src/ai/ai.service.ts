import { Injectable } from '@nestjs/common';
import { aiAnalysisSchema, aiContextSchema } from '@thesis-ledger/schemas';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../platform/prisma.service.js';
import { explicitlyAllowsStale, hasStaleMarketData } from '../market/freshness.js';

type PortfolioMode = 'actual' | 'shadow';

export type ToolPermission =
  | 'market:read'
  | 'portfolio:read'
  | 'risk:read'
  | 'journal:read'
  | 'financials:read'
  | 'news:read'
  | 'announcements:read'
  | 'backtest:run';

export type AiProviderHealth = 'unknown' | 'healthy' | 'degraded' | 'down';

export interface AiProviderMetadata {
  baseURL?: string;
  capabilities?: readonly string[];
  health?: AiProviderHealth;
  costPer1kInput?: number;
  costPer1kOutput?: number;
}

export interface AiTool {
  readonly name: string;
  readonly permission: ToolPermission;
  readonly description?: string;
  execute(input: unknown, signal: AbortSignal): Promise<unknown>;
}
export interface AiProvider {
  readonly id: string;
  readonly models: readonly string[];
  readonly metadata?: AiProviderMetadata;
  complete(
    input: { model: string; messages: unknown[]; tools: string[] },
    signal: AbortSignal,
  ): Promise<{ content: unknown; inputTokens: number; outputTokens: number; cost: number }>;
}

export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();
  register(provider: AiProvider) {
    this.providers.set(provider.id, provider);
  }

  list() {
    return [...this.providers.values()].map((provider) => ({
      id: provider.id,
      models: [...provider.models],
      metadata: provider.metadata ?? {},
    }));
  }

  health() {
    return this.list().map((provider) => ({
      ...provider,
      health: provider.metadata?.health ?? 'unknown',
    }));
  }
  route(preferred: string | undefined, model: string) {
    const direct = preferred ? this.providers.get(preferred) : undefined;
    if (direct?.models.includes(model)) return direct;
    const fallback = [...this.providers.values()].find((provider) =>
      provider.models.includes(model),
    );
    if (!fallback) throw new Error(`没有支持模型 ${model} 的 AI Provider`);
    return fallback;
  }
  candidates(model: string, preferred?: string) {
    return [...this.providers.values()]
      .filter((provider) => provider.models.includes(model))
      .sort((left, right) => {
        if (left.id === preferred) return -1;
        if (right.id === preferred) return 1;
        return left.id.localeCompare(right.id);
      });
  }
}

export interface PromptTemplate {
  name: string;
  version: string;
  template: string;
  changedAt: string;
}

export class PromptVersionRegistry {
  private readonly prompts = new Map<string, PromptTemplate[]>();

  register(prompt: PromptTemplate) {
    const versions = this.prompts.get(prompt.name) ?? [];
    if (versions.some((item) => item.version === prompt.version)) {
      throw new Error(`Prompt 版本已存在: ${prompt.name}@${prompt.version}`);
    }
    versions.push(prompt);
    this.prompts.set(prompt.name, versions);
    return prompt;
  }

  latest(name: string) {
    const versions = this.prompts.get(name) ?? [];
    return versions.at(-1);
  }

  history(name: string) {
    return [...(this.prompts.get(name) ?? [])];
  }
}

export const completeWithFallback = async (
  registry: AiProviderRegistry,
  input: { model: string; messages: unknown[]; tools: string[]; preferred?: string },
) => {
  const errors: string[] = [];
  for (const provider of registry.candidates(input.model, input.preferred)) {
    try {
      const result = await provider.complete(input, AbortSignal.timeout(30_000));
      return { ...result, provider: provider.id, fallbackErrors: errors };
    } catch (error) {
      errors.push(`${provider.id}: ${error instanceof Error ? error.message : '调用失败'}`);
    }
  }
  throw new AggregateError(errors, `没有可用的 AI Provider: ${input.model}`);
};

export const assertToolPermission = (tool: AiTool, allowed: ReadonlySet<ToolPermission>) => {
  if (!allowed.has(tool.permission)) throw new Error(`无权调用工具 ${tool.name}`);
};

export const executeToolSafely = async (
  tool: AiTool,
  input: unknown,
  allowed: ReadonlySet<ToolPermission>,
  timeoutMs = 10_000,
) => {
  assertToolPermission(tool, allowed);
  try {
    const startedAt = Date.now();
    const data = await tool.execute(input, AbortSignal.timeout(timeoutMs));
    if (hasStaleMarketData(data) && !explicitlyAllowsStale(input))
      throw new Error('AI 默认拒绝陈旧或部分市场数据');
    return {
      status: 'ok' as const,
      data,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 'unavailable' as const,
      data: null,
      error: error instanceof Error ? error.message : 'Tool 调用失败',
      durationMs: timeoutMs,
    };
  }
};

export interface ResearchSource {
  sourceId: string;
  provider: string;
  publishedAt?: string;
  availableAt?: string;
  marketTime?: string;
  fetchedAt: string;
}

export interface ResearchToolAdapters {
  financials?: (
    input: { symbol: string; accountId?: string; mode?: PortfolioMode },
    signal: AbortSignal,
  ) => Promise<unknown>;
  news?: (
    input: { symbol: string; accountId?: string; mode?: PortfolioMode },
    signal: AbortSignal,
  ) => Promise<unknown>;
  announcements?: (
    input: { symbol: string; accountId?: string; mode?: PortfolioMode },
    signal: AbortSignal,
  ) => Promise<unknown>;
  journal?: (
    input: { symbol?: string; accountId?: string; mode?: PortfolioMode },
    signal: AbortSignal,
  ) => Promise<unknown>;
  riskHistory?: (
    input: { symbol?: string; accountId?: string; mode?: PortfolioMode },
    signal: AbortSignal,
  ) => Promise<unknown>;
  runBacktest?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
}

export interface CoreToolAdapters {
  getPortfolio?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
  getPositions?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
  getQuote?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
  getBars?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
  getIndicators?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
  getChipDistribution?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
  getRisk?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
}

const scopeToolInput = (input: unknown) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const value = input as Record<string, unknown>;
  return {
    ...value,
    mode: value.mode === 'shadow' ? 'shadow' : 'actual',
  };
};

const adapterTool = (
  name: string,
  permission: ToolPermission,
  execute: (input: unknown, signal: AbortSignal) => Promise<unknown>,
): AiTool => ({ name, permission, execute });

export const createCoreTools = (adapters: CoreToolAdapters): AiTool[] => {
  const definitions: Array<[keyof CoreToolAdapters, string, ToolPermission]> = [
    ['getPortfolio', 'getPortfolio', 'portfolio:read'],
    ['getPositions', 'getPositions', 'portfolio:read'],
    ['getQuote', 'getQuote', 'market:read'],
    ['getBars', 'getBars', 'market:read'],
    ['getIndicators', 'getIndicators', 'market:read'],
    ['getChipDistribution', 'getChipDistribution', 'market:read'],
    ['getRisk', 'getRisk', 'risk:read'],
  ];
  return definitions.flatMap(([key, name, permission]) => {
    const execute = adapters[key];
    return execute
      ? [adapterTool(name, permission, (input, signal) => execute(scopeToolInput(input), signal))]
      : [];
  });
};

export const createResearchTools = (adapters: ResearchToolAdapters): AiTool[] => {
  const tools: AiTool[] = [];
  const scopedInput = (
    input: unknown,
  ): {
    symbol?: string;
    accountId?: string;
    mode: PortfolioMode;
  } => {
    const value = input as { symbol?: string; accountId?: string; mode?: PortfolioMode };
    return {
      ...(value.symbol ? { symbol: value.symbol } : {}),
      ...(value.accountId ? { accountId: value.accountId } : {}),
      mode: value.mode === 'shadow' ? 'shadow' : 'actual',
    };
  };
  if (adapters.financials)
    tools.push(
      adapterTool('getFinancials', 'financials:read', (input, signal) => {
        const scoped = scopedInput(input);
        return adapters.financials!({ symbol: scoped.symbol ?? '', ...scoped }, signal);
      }),
    );
  if (adapters.news)
    tools.push(
      adapterTool('getNews', 'news:read', (input, signal) => {
        const scoped = scopedInput(input);
        return adapters.news!({ symbol: scoped.symbol ?? '', ...scoped }, signal);
      }),
    );
  if (adapters.announcements)
    tools.push(
      adapterTool('getAnnouncements', 'announcements:read', (input, signal) => {
        const scoped = scopedInput(input);
        return adapters.announcements!({ symbol: scoped.symbol ?? '', ...scoped }, signal);
      }),
    );
  if (adapters.journal)
    tools.push(
      adapterTool('getJournal', 'journal:read', (input, signal) =>
        adapters.journal!(scopedInput(input), signal),
      ),
    );
  if (adapters.riskHistory)
    tools.push(
      adapterTool('getRiskHistory', 'risk:read', (input, signal) =>
        adapters.riskHistory!(scopedInput(input), signal),
      ),
    );
  if (adapters.runBacktest)
    tools.push(adapterTool('runBacktest', 'backtest:run', adapters.runBacktest));
  return tools;
};

export const buildPortfolioContext = (input: {
  symbol: string;
  quantity: number;
  marketValue: number;
  totalMarketValue: number;
  riskEvents: readonly unknown[];
}) => ({
  symbol: input.symbol,
  quantity: input.quantity,
  marketValue: input.marketValue,
  weight: input.totalMarketValue === 0 ? 0 : input.marketValue / input.totalMarketValue,
  riskEvents: [...input.riskEvents],
});

export const runResearchAgent = async (
  tools: readonly AiTool[],
  input: { symbol: string; accountId?: string; mode?: PortfolioMode },
  allowed: ReadonlySet<ToolPermission>,
) => {
  const evidence: Array<{ tool: string; data: unknown; status: string; error?: string }> = [];
  for (const tool of tools.filter((item) =>
    ['getFinancials', 'getNews', 'getAnnouncements'].includes(item.name),
  )) {
    const result = await executeToolSafely(tool, input, allowed);
    evidence.push({ tool: tool.name, ...result });
  }
  return {
    evidence,
    hypothesis: evidence.length === 0 ? '暂无足够证据' : '等待风险批评与组合上下文复核',
  };
};

const evidenceCitation = (tool: string, data: unknown) => {
  const value = data as {
    sourceId?: string;
    provider?: string;
    marketTime?: string;
    availableAt?: string;
    fetchedAt?: string;
  };
  const observedAt = value.marketTime ?? value.availableAt ?? new Date().toISOString();
  return {
    tool,
    sourceId: value.sourceId ?? `${tool}:result`,
    provider: value.provider ?? 'thesis-ledger-tool',
    observedAt,
    ...(value.marketTime ? { marketTime: value.marketTime } : {}),
    ...(value.availableAt ? { availableAt: value.availableAt } : {}),
    ...(value.fetchedAt ? { fetchedAt: value.fetchedAt } : {}),
  };
};

export const runPortfolioAnalysis = async (
  tools: readonly AiTool[],
  input: unknown,
  allowed: ReadonlySet<ToolPermission>,
) => {
  const evidence = [];
  for (const name of ['getPortfolio', 'getPositions', 'getRisk']) {
    const tool = tools.find((item) => item.name === name);
    if (!tool) continue;
    const result = await executeToolSafely(tool, input, allowed);
    if (result.status === 'ok')
      evidence.push({
        claim: `${name} 返回确定性结果`,
        citations: [evidenceCitation(name, result.data)],
      });
  }
  return {
    conclusion: evidence.length ? '组合与风险数据已收集，等待用户复核。' : '组合数据不可用。',
    evidence,
    risks: [],
    unknowns: evidence.length ? [] : ['组合 Tool 不可用'],
    disclaimer: '仅供研究参考，不构成投资建议。',
  };
};

export const runRiskExplanation = async (
  tools: readonly AiTool[],
  input: { ruleId: string; threshold: number; triggerValue: number; symbol?: string },
  allowed: ReadonlySet<ToolPermission>,
) => {
  const tool = tools.find((item) => item.name === 'getRisk');
  const result = tool
    ? await executeToolSafely(tool, input, allowed)
    : { status: 'unavailable' as const, data: null };
  return {
    conclusion: `规则 ${input.ruleId} 在 ${input.symbol ?? '组合'} 触发：触发值 ${input.triggerValue}，阈值 ${input.threshold}。`,
    evidence: [
      {
        claim: `RiskEvent ${input.ruleId} 的触发值为 ${input.triggerValue}，阈值为 ${input.threshold}`,
        citations: [
          evidenceCitation('risk-event', {
            sourceId: input.ruleId,
            provider: 'thesis-ledger-risk',
            marketTime: new Date().toISOString(),
          }),
        ],
      },
      ...(result.status === 'ok'
        ? [
            {
              claim: 'getRisk 提供规则上下文',
              citations: [evidenceCitation('getRisk', result.data)],
            },
          ]
        : []),
    ],
    risks: [],
    unknowns: result.status === 'ok' ? [] : ['Risk 上下文 Tool 不可用'],
    disclaimer: '仅解释已触发的确定性规则，不构成交易指令。',
  };
};

export const runRiskCritic = (research: {
  evidence: ReadonlyArray<{ tool: string; data: unknown; status: string }>;
}) => ({
  objections: [
    ...(research.evidence.some((item) => item.status !== 'ok')
      ? ['存在不可用或失败的数据工具']
      : []),
    ...(research.evidence.length < 3 ? ['证据类别不足，不能形成完整结论'] : []),
    '需要核对数据时点与可用时间，避免把未来信息带入判断',
  ],
  evidence: research.evidence,
});

export const portfolioGate = (input: {
  analysis: unknown;
  hasMissingData: boolean;
  hasExecutionInstruction?: boolean;
}) => {
  if (input.hasMissingData) throw new Error('关键数据不足，研究报告拒绝生成');
  if (input.hasExecutionInstruction) throw new Error('研究报告不得生成执行指令');
  return input.analysis;
};

export const composeFinalAnalysis = (input: {
  research: { evidence: readonly unknown[]; hypothesis: string };
  critic: { objections: readonly string[] };
  context: unknown;
}) => ({
  conclusion: input.research.hypothesis,
  evidence: input.research.evidence,
  risks: [...input.critic.objections],
  context: input.context,
  disclaimer: '仅供研究参考，不构成投资建议或交易指令。',
});

export const validateGroundedAnalysis = (value: unknown) => {
  const parsed = aiAnalysisSchema.parse(value);
  if (parsed.evidence.some((item) => item.citations.length === 0))
    throw new Error('AI 结论缺少来源');
  if (/(自动交易|立即下单|买入\s*\d+|卖出\s*\d+)/u.test(parsed.conclusion))
    throw new Error('AI 输出不得生成执行订单');
  const numbers = parsed.conclusion.match(/\d+(?:\.\d+)?/g) ?? [];
  const evidenceText = parsed.evidence.map((item) => item.claim).join(' ');
  if (numbers.some((number) => !evidenceText.includes(number)))
    throw new Error('AI 结论中的关键数字缺少可追溯证据');
  return parsed;
};

@Injectable()
export class AiRunService {
  constructor(private readonly prisma: PrismaService) {}
  start(
    provider: string,
    model: string,
    promptVersion: string,
    context?: unknown,
    modelMetadata?: unknown,
  ) {
    const parsedContext = context === undefined ? undefined : aiContextSchema.parse(context);
    return this.prisma.aiRun.create({
      data: {
        provider,
        model,
        promptVersion,
        status: 'running',
        ...(parsedContext === undefined ? {} : { context: parsedContext }),
        ...(modelMetadata === undefined
          ? {}
          : { modelMetadata: modelMetadata as Prisma.InputJsonValue }),
      },
    });
  }
  checkpoint(id: string, checkpoint: object) {
    return this.prisma.aiRun.update({ where: { id }, data: { checkpoint } });
  }
  finish(
    id: string,
    result: unknown,
    usage: { inputTokens: number; outputTokens: number; cost: number },
  ) {
    return this.prisma.aiRun.update({
      where: { id },
      data: { status: 'succeeded', result: result as object, ...usage },
    });
  }

  recordToolCall(input: {
    runId: string;
    tool: string;
    permission: ToolPermission;
    status: 'ok' | 'unavailable' | 'denied';
    inputSummary: string;
    outputSummary?: string;
    provider?: string;
    durationMs?: number;
    marketTime?: string;
    availableAt?: string;
    fetchedAt?: string;
  }) {
    return this.prisma.aiToolCall.create({
      data: {
        aiRunId: input.runId,
        tool: input.tool,
        permission: input.permission,
        status: input.status,
        inputSummary: input.inputSummary,
        ...(input.outputSummary === undefined ? {} : { outputSummary: input.outputSummary }),
        ...(input.provider === undefined ? {} : { provider: input.provider }),
        ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
        ...(input.marketTime === undefined ? {} : { marketTime: new Date(input.marketTime) }),
        ...(input.availableAt === undefined ? {} : { availableAt: new Date(input.availableAt) }),
        ...(input.fetchedAt === undefined ? {} : { fetchedAt: new Date(input.fetchedAt) }),
      },
    });
  }

  resume(id: string) {
    return this.prisma.aiRun.findUnique({ where: { id } });
  }

  list(limit = 50) {
    return this.prisma.aiRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 100)),
      select: {
        id: true,
        provider: true,
        model: true,
        promptVersion: true,
        status: true,
        context: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async usageSummary(start?: Date, end?: Date) {
    const runs = await this.prisma.aiRun.findMany({
      where: {
        ...(start || end
          ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } }
          : {}),
      },
    });
    return runs.reduce(
      (summary: { runs: number; inputTokens: number; outputTokens: number; cost: number }, run) => {
        summary.runs += 1;
        summary.inputTokens += run.inputTokens;
        summary.outputTokens += run.outputTokens;
        summary.cost += Number(run.cost);
        return summary;
      },
      { runs: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
    );
  }

  createDecisionLog(input: {
    symbol?: string;
    accountId?: string;
    question: string;
    assumptions: unknown;
    conclusion: unknown;
    context?: unknown;
    provenance?: unknown;
  }) {
    return this.prisma.aiDecisionLog.create({
      data: {
        ...(input.symbol === undefined ? {} : { symbol: input.symbol }),
        ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
        question: input.question,
        assumptions: input.assumptions as object,
        conclusion: input.conclusion as object,
        ...(input.context === undefined ? {} : { context: input.context as object }),
        ...(input.provenance === undefined ? {} : { provenance: input.provenance as object }),
      },
    });
  }

  listDecisionLogs(symbol?: string) {
    return this.prisma.aiDecisionLog.findMany({
      ...(symbol ? { where: { symbol } } : {}),
      orderBy: { createdAt: 'desc' },
    });
  }
}
