import { describe, expect, it, vi } from 'vitest';
import {
  AiProviderRegistry,
  assertToolPermission,
  buildPortfolioContext,
  composeFinalAnalysis,
  createCoreTools,
  createResearchTools,
  completeWithFallback,
  executeToolSafely,
  portfolioGate,
  PromptVersionRegistry,
  runResearchAgent,
  runPortfolioAnalysis,
  runRiskExplanation,
  type ToolPermission,
  runRiskCritic,
  validateGroundedAnalysis,
} from '../../src/ai/ai.service.js';
import { parseConfig } from '../../src/platform/config.js';
import { IntegrityService } from '../../src/integrity/integrity.service.js';
import {
  redactSecrets,
  renderStructuredLog,
  runWithTrace,
} from '../../src/platform/structured-logger.js';
import { ApiRateLimiter } from '../../src/platform/api-rate-limit.js';
import { ErrorTrackingService } from '../../src/platform/error-tracking.service.js';

describe('AI 安全边界', () => {
  it('按模型路由 Provider', () => {
    const registry = new AiProviderRegistry();
    const provider = {
      id: 'mock',
      models: ['m1'],
      complete: async () => ({ content: {}, inputTokens: 0, outputTokens: 0, cost: 0 }),
    };
    registry.register(provider);
    expect(registry.route(undefined, 'm1')).toBe(provider);
  });
  it('主模型失败后路由备用 Provider 并记录失败链', async () => {
    const registry = new AiProviderRegistry();
    registry.register({
      id: 'primary',
      models: ['m1'],
      complete: async () => {
        throw new Error('down');
      },
    });
    registry.register({
      id: 'fallback',
      models: ['m1'],
      complete: async () => ({ content: {}, inputTokens: 1, outputTokens: 2, cost: 0.1 }),
    });
    await expect(
      completeWithFallback(registry, {
        model: 'm1',
        messages: [],
        tools: [],
        preferred: 'primary',
      }),
    ).resolves.toMatchObject({ provider: 'fallback', fallbackErrors: ['primary: down'] });
  });
  it('拒绝越权 Tool', () =>
    expect(() =>
      assertToolPermission(
        { name: 'runBacktest', permission: 'backtest:run', execute: async () => null },
        new Set(['market:read']),
      ),
    ).toThrow('无权'));
  it('Tool 失败返回 unavailable 而不是伪造零值', async () =>
    expect(
      await executeToolSafely(
        {
          name: 'news',
          permission: 'market:read',
          execute: async () => {
            throw new Error('timeout');
          },
        },
        {},
        new Set(['market:read']),
      ),
    ).toMatchObject({ status: 'unavailable', data: null, error: 'timeout' }));
  it('AI 默认拒绝带 stale 或 partial 标记的市场数据', async () => {
    const result = await executeToolSafely(
      {
        name: 'quote',
        permission: 'market:read',
        execute: async () => ({ price: 10, stale: true }),
      },
      {},
      new Set(['market:read']),
    );
    expect(result).toMatchObject({ status: 'unavailable', data: null });
  });
  it('Provider 元数据与 Prompt 版本可查询', () => {
    const registry = new AiProviderRegistry();
    registry.register({
      id: 'mock',
      models: ['m1'],
      metadata: { baseURL: 'http://mock', capabilities: ['chat'], health: 'healthy' },
      complete: async () => ({ content: {}, inputTokens: 0, outputTokens: 0, cost: 0 }),
    });
    expect(registry.health()[0]).toMatchObject({ id: 'mock', health: 'healthy' });
    const prompts = new PromptVersionRegistry();
    prompts.register({ name: 'research', version: 'v1', template: 'a', changedAt: '2025-01-01' });
    prompts.register({ name: 'research', version: 'v2', template: 'b', changedAt: '2025-01-02' });
    expect(prompts.latest('research')?.version).toBe('v2');
  });
  it('研究工具保留时序字段并限制到只读上下文', async () => {
    const tools = createResearchTools({
      financials: async () => ({
        sourceId: 'f1',
        provider: 'fixture',
        availableAt: '2025-01-01T00:00:00Z',
        fetchedAt: '2025-01-02T00:00:00Z',
      }),
      news: async () => ({ sourceId: 'n1', provider: 'fixture', publishedAt: '2025-01-01' }),
      announcements: async () => ({
        sourceId: 'a1',
        provider: 'fixture',
        publishedAt: '2025-01-01',
      }),
      runBacktest: async () => ({ id: 'job-1' }),
    });
    const result = await runResearchAgent(
      tools,
      { symbol: '600519.SH' },
      new Set(['financials:read', 'news:read', 'announcements:read']),
    );
    expect(result.evidence).toHaveLength(3);
    expect(() => assertToolPermission(tools.at(-1)!, new Set(['market:read']))).toThrow('无权');
  });
  it('V0.1 Core Tool Registry 暴露统一只读权限', () => {
    const tools = createCoreTools({
      getPortfolio: async () => ({ total: 1 }),
      getPositions: async () => [],
      getQuote: async () => ({ price: 1 }),
      getBars: async () => [],
      getIndicators: async () => ({}),
      getChipDistribution: async () => ({}),
      getRisk: async () => [],
    });
    expect(tools.map((tool) => tool.name)).toEqual([
      'getPortfolio',
      'getPositions',
      'getQuote',
      'getBars',
      'getIndicators',
      'getChipDistribution',
      'getRisk',
    ]);
  });
  it('Portfolio/Risk 分析只消费 Tool 结果并保留引用', async () => {
    const tools = createCoreTools({
      getPortfolio: async () => ({
        sourceId: 'p1',
        provider: 'fixture',
        marketTime: '2025-01-01T00:00:00Z',
      }),
      getPositions: async () => ({
        sourceId: 'pos1',
        provider: 'fixture',
        marketTime: '2025-01-01T00:00:00Z',
      }),
      getRisk: async () => ({
        sourceId: 'r1',
        provider: 'fixture',
        marketTime: '2025-01-01T00:00:00Z',
      }),
    });
    const allowed = new Set<ToolPermission>(['portfolio:read', 'risk:read']);
    const portfolio = await runPortfolioAnalysis(tools, {}, allowed);
    expect(portfolio.evidence).toHaveLength(3);
    const risk = await runRiskExplanation(
      tools,
      { ruleId: 'r1', threshold: 10, triggerValue: 9 },
      allowed,
    );
    expect(risk.conclusion).toContain('触发值 9');
    expect(validateGroundedAnalysis(risk).evidence.length).toBeGreaterThan(0);
  });
  it('Research/Critic/Portfolio Gate 只产生研究报告，不产生执行指令', () => {
    const research = {
      evidence: [{ tool: 'quote', data: { price: 10 }, status: 'ok' }],
      hypothesis: '等待复核',
    };
    const critic = runRiskCritic(research);
    const context = buildPortfolioContext({
      symbol: '600519.SH',
      quantity: 100,
      marketValue: 1000,
      totalMarketValue: 10000,
      riskEvents: [],
    });
    const report = composeFinalAnalysis({ research, critic, context });
    expect(portfolioGate({ analysis: report, hasMissingData: false })).toBe(report);
    expect(() => portfolioGate({ analysis: report, hasMissingData: true })).toThrow('数据不足');
  });
  it('接受带来源的结构化分析', () =>
    expect(
      validateGroundedAnalysis({
        conclusion: '谨慎',
        evidence: [
          {
            claim: '波动上升',
            citations: [
              {
                tool: 'risk',
                sourceId: '1',
                provider: 'internal',
                observedAt: '2025-01-01T00:00:00Z',
              },
            ],
          },
        ],
        risks: [],
        unknowns: [],
        disclaimer: '仅供研究',
      }).conclusion,
    ).toBe('谨慎'));
  it('拦截无来源关键数字和自动交易指令', () => {
    const base = {
      evidence: [
        {
          claim: '价格为 10',
          citations: [
            {
              tool: 'quote',
              sourceId: '1',
              provider: 'mock',
              observedAt: '2025-01-01T00:00:00Z',
            },
          ],
        },
      ],
      risks: [],
      unknowns: [],
      disclaimer: '仅供研究',
    };
    expect(() => validateGroundedAnalysis({ ...base, conclusion: '价格为 20' })).toThrow('数字');
    expect(() => validateGroundedAnalysis({ ...base, conclusion: '立即下单买入 10 股' })).toThrow(
      '执行订单',
    );
  });
});

describe('环境配置', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    DSA_BASE_URL: 'http://localhost:8000',
    THESIS_LEDGER_DSA_TOKEN: 'test-token',
    CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  };
  it('解析完整必需配置', () =>
    expect(parseConfig(base)).toMatchObject({
      port: 3000,
      providerHealthCheckIntervalMs: 3_600_000,
    }));
  it('缺失数据库配置时明确失败字段', () =>
    expect(() => parseConfig({ ...base, DATABASE_URL: undefined })).toThrow('DATABASE_URL'));
  it('缺失凭证加密密钥时明确失败字段', () =>
    expect(() => parseConfig({ ...base, CREDENTIAL_ENCRYPTION_KEY: undefined })).toThrow(
      'CREDENTIAL_ENCRYPTION_KEY',
    ));
});

describe('结构化日志', () => {
  it('统一 traceId 并脱敏凭证字段', () => {
    const line = runWithTrace('trace-fixture', () =>
      renderStructuredLog({
        operation: 'provider.request',
        token: 'secret-token',
        nested: { webhookUrl: 'https://example.test/hook', ok: true },
      }),
    );
    expect(line).toContain('trace-fixture');
    expect(line).toContain('[REDACTED]');
    expect(line).not.toContain('secret-token');
    expect(redactSecrets({ apiKey: 'secret' })).toEqual({ apiKey: '[REDACTED]' });
  });
});

describe('API 限流', () => {
  it('普通与重任务使用独立窗口并返回可重试时间', () => {
    const limiter = new ApiRateLimiter(2, 1, 1000);
    expect(limiter.consume('client', false, 0).allowed).toBe(true);
    expect(limiter.consume('client', false, 1).allowed).toBe(true);
    expect(limiter.consume('client', false, 2)).toMatchObject({
      allowed: false,
      retryAfterMs: 998,
    });
    expect(limiter.consume('client', true, 2).allowed).toBe(true);
    expect(limiter.consume('client', false, 1001).allowed).toBe(true);
  });
});

describe('Error Tracking', () => {
  it('默认关闭且开启时只发送脱敏错误元数据', async () => {
    const previous = process.env.ERROR_TRACKING_URL;
    process.env.ERROR_TRACKING_URL = 'https://errors.example.test/events';
    const fetchMock = vi.fn(async () => new Response('', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      new ErrorTrackingService().capture({
        operation: 'http.unhandled_exception',
        errorCode: 'internal_error',
        traceId: 'trace-e2e',
      }),
    ).resolves.toMatchObject({ sent: true, status: 202 });
    const requestInit = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ event: 'thesis-ledger.error', traceId: 'trace-e2e' });
    expect(JSON.stringify(body)).not.toContain('portfolio');
    vi.unstubAllGlobals();
    if (previous === undefined) delete process.env.ERROR_TRACKING_URL;
    else process.env.ERROR_TRACKING_URL = previous;
  });
});

describe('数据完整性', () => {
  it('报告重复流水、投影不一致和非法快照但不自动修改', async () => {
    const prisma = {
      account: {
        findMany: vi.fn(async () => [
          {
            id: 'account',
            ledger: [
              {
                id: '1',
                accountId: 'account',
                type: 'BUY',
                symbol: '600519.SH',
                quantity: 100,
                price: 10,
                fee: 0,
                tax: 0,
                externalId: 'same',
                occurredAt: new Date('2025-01-01T00:00:00Z'),
              },
              {
                id: '2',
                accountId: 'account',
                type: 'BONUS',
                symbol: '600519.SH',
                quantity: 10,
                price: null,
                fee: null,
                tax: null,
                externalId: 'same',
                occurredAt: new Date('2025-01-02T00:00:00Z'),
              },
            ],
            positions: [{ symbol: '600519.SH', quantity: 100, costPrice: 10 }],
            snapshots: [{ id: 'snapshot', marketValue: -1, costValue: 1 }],
          },
        ]),
      },
    };
    const result = await new IntegrityService(prisma as never).check();
    expect(result.healthy).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'duplicate_external_uid',
      'position_projection_mismatch',
      'invalid_snapshot_value',
    ]);
    expect(Object.keys(prisma)).toEqual(['account']);
  });
  it('识别带 opening-balance metadata 的 Ledger 投影', async () => {
    const prisma = {
      account: {
        findMany: vi.fn(async () => [
          {
            id: 'account',
            ledger: [
              {
                id: 'adjustment',
                accountId: 'account',
                type: 'ADJUSTMENT',
                symbol: '600519.SH',
                quantity: 10,
                price: 1450,
                fee: null,
                tax: null,
                externalId: 'opening-balance',
                metadata: { kind: 'opening-balance', quantity: 10, costPrice: 1450 },
                occurredAt: new Date('2025-01-01T00:00:00Z'),
              },
            ],
            positions: [{ symbol: '600519.SH', quantity: 10, costPrice: 1450 }],
            snapshots: [],
          },
        ]),
      },
    };
    await expect(new IntegrityService(prisma as never).check()).resolves.toMatchObject({
      accountCount: 1,
      issueCount: 0,
      healthy: true,
    });
  });
});
