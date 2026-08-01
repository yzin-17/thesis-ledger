import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  detectScreenshotSource,
  ImportService,
  validateVisionPosition,
} from '../src/imports/import.service.js';
import { matchesSignature } from '../src/imports/import.controller.js';
import {
  buildDailyDigest,
  channelsForSeverity,
  classifyDeliveryError,
  isQuietTime,
} from '../src/notifications/notification.service.js';
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
  AiRunService,
} from '../src/ai/ai.service.js';
import { parseConfig } from '../src/platform/config.js';
import { MarketService } from '../src/market/market.service.js';
import { AccountsService } from '../src/portfolio/accounts.service.js';
import { PortfolioService } from '../src/portfolio/portfolio.service.js';
import { nextCronOccurrence, runWithRetry } from '../src/automation/automation.service.js';
import { IntegrityService } from '../src/integrity/integrity.service.js';
import { RiskService } from '../src/risk/risk.service.js';
import { ProviderHealthService } from '../src/providers/provider-health.service.js';
import { MarketStorageService } from '../src/market/market-storage.service.js';
import { DataQualityService } from '../src/quality/data-quality.service.js';
import { PerformanceService } from '../src/performance/performance.service.js';
import { LedgerService, appendLedgerEvent } from '../src/ledger/ledger.service.js';
import { BacktestService } from '../src/backtest/backtest.service.js';
import { JournalService } from '../src/journal/journal.service.js';
import { ProviderConfigService } from '../src/providers/provider-config.service.js';
import {
  redactSecrets,
  renderStructuredLog,
  runWithTrace,
} from '../src/platform/structured-logger.js';
import { ApiRateLimiter } from '../src/platform/api-rate-limit.js';
import { ErrorTrackingService } from '../src/platform/error-tracking.service.js';
import {
  dailyDigest,
  dailyRiskSummary,
  dataHealthAlert,
  intradayRiskScan,
  isTradingDay,
  openingScan,
  preMarketPositionEvents,
  weeklyStrategyReview,
} from '../src/automation/workflows.service.js';

describe('截图导入', () => {
  it('Ground Truth fixture 覆盖三类来源且字段可回归', () => {
    const fixture = JSON.parse(
      readFileSync(new URL('./fixtures/screenshot-ground-truth.json', import.meta.url), 'utf8'),
    ) as Array<{ source: string; symbol: string; quantity: number; costPrice: number }>;
    expect(fixture).toHaveLength(15);
    expect(new Set(fixture.map((item) => item.source))).toEqual(
      new Set(['alipay', 'ths', 'broker']),
    );
    expect(fixture.every((item) => item.symbol && item.quantity > 0 && item.costPrice >= 0)).toBe(
      true,
    );
  });
  it.each([
    ['支付宝持仓', 'alipay'],
    ['同花顺资产', 'ths'],
    ['某某证券', 'broker'],
    ['无法识别', 'unknown'],
  ] as const)('识别来源 %s', (text, source) => expect(detectScreenshotSource(text)).toBe(source));
  it('标记数值差异和低置信度', () =>
    expect(
      validateVisionPosition({
        quantity: 100,
        costPrice: 10,
        marketPrice: 10,
        marketValue: 3000,
        confidence: 0.5,
      }),
    ).toEqual(['市值与数量、市场价不一致', '识别置信度较低']));
  it('保留缺失字段并检查市场价、盈亏和盈亏比例', () =>
    expect(
      validateVisionPosition({
        quantity: 100,
        costPrice: 10,
        marketPrice: 12,
        marketValue: 1000,
        profit: 50,
        profitRate: 0.5,
        confidence: 1,
      }),
    ).toEqual(['市值与数量、市场价不一致', '盈亏与数量、成本价、市场价不一致', '盈亏比例不一致']));
  it('根据文件内容识别 PNG、JPEG、WebP 并拒绝伪装内容', () => {
    expect(matchesSignature(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png')).toBe(
      true,
    );
    expect(matchesSignature(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg')).toBe(true);
    expect(matchesSignature(Buffer.from('RIFFxxxxWEBP'), 'image/webp')).toBe(true);
    expect(matchesSignature(Buffer.from('not-an-image'), 'image/png')).toBe(false);
  });
  it('Vision Provider 可替换并通过 Mock 创建草稿', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const prisma = {
      importDraft: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: object }) => data),
      },
      asset: {
        findUnique: vi.fn(async () => ({ symbol: '600519.SH' })),
        findMany: vi.fn(),
      },
      position: { findMany: vi.fn(async () => []) },
    };
    const provider = {
      id: 'mock',
      extract: vi.fn(async () => [
        { symbol: '600519', quantity: 100, costPrice: 10, confidence: 1, rawText: {} },
      ]),
    };
    const draft = await new ImportService(prisma as never).createDraftFromProvider(
      accountId,
      Buffer.from('image'),
      'unknown',
      provider,
      0.4,
    );
    expect(provider.extract).toHaveBeenCalledOnce();
    expect(draft).toMatchObject({ source: 'unknown', sourceConfidence: 0.4, status: 'pending' });
  });
  it('资产匹配明确区分 matched、ambiguous 和 unmatched', async () => {
    const prisma = {
      asset: {
        findUnique: vi.fn(async () => null),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            { symbol: '510300.SH', name: '沪深300' },
            { symbol: '159919.SZ', name: '沪深300' },
          ])
          .mockResolvedValueOnce([]),
      },
    };
    const service = new ImportService(prisma as never);
    await expect(service.matchAsset({ name: '沪深300', confidence: 1 })).resolves.toMatchObject({
      status: 'ambiguous',
      candidates: ['510300.SH', '159919.SZ'],
    });
    await expect(service.matchAsset({ name: '不存在', confidence: 1 })).resolves.toMatchObject({
      status: 'unmatched',
    });
  });
  it('同一账户重复截图返回已有草稿且不写持仓', async () => {
    const existing = { id: 'existing', status: 'pending' };
    const prisma = {
      importDraft: { findUnique: vi.fn(async () => existing), create: vi.fn() },
      position: { upsert: vi.fn() },
      asset: { upsert: vi.fn() },
    };
    await expect(
      new ImportService(prisma as never).createDraft(
        '11111111-1111-4111-8111-111111111111',
        Buffer.from('same-image'),
        'alipay',
        [],
      ),
    ).resolves.toBe(existing);
    expect(prisma.importDraft.create).not.toHaveBeenCalled();
    expect(prisma.position.upsert).not.toHaveBeenCalled();
  });
  it('提交幂等，已提交草稿不会重复写持仓', async () => {
    const tx = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: '11111111-1111-4111-8111-111111111112',
          accountId: '11111111-1111-4111-8111-111111111111',
          status: 'committed',
        })),
        update: vi.fn(),
      },
      position: { upsert: vi.fn() },
      asset: { upsert: vi.fn() },
    };
    const prisma = { $transaction: (operation: (client: typeof tx) => unknown) => operation(tx) };
    await new ImportService(prisma as never).commit('draft', []);
    expect(tx.position.upsert).not.toHaveBeenCalled();
    expect(tx.asset.upsert).not.toHaveBeenCalled();
  });
  it('截图提交写入可重放的 Ledger Adjustment，而不是直接写 Position', async () => {
    const draftId = '11111111-1111-4111-8111-111111111114';
    const tx = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: draftId,
          accountId: '11111111-1111-4111-8111-111111111111',
          source: 'alipay',
          status: 'pending',
        })),
        update: vi.fn(async ({ data }: { data: object }) => ({
          id: draftId,
          accountId: '11111111-1111-4111-8111-111111111111',
          ...data,
        })),
      },
      position: { upsert: vi.fn() },
      asset: { upsert: vi.fn(async ({ create }: { create: object }) => create) },
      ledgerEvent: { upsert: vi.fn(async ({ create }: { create: object }) => create) },
    };
    const prisma = { $transaction: (operation: (client: typeof tx) => unknown) => operation(tx) };
    await new ImportService(prisma as never).commit(draftId, [
      {
        rawSymbol: '600519.SH',
        symbol: '600519.SH',
        matchStatus: 'matched',
        matchCandidates: ['600519.SH'],
        quantity: 100,
        costPrice: 10,
        confidence: 1,
        rawText: {},
        issues: [],
      },
    ]);
    expect(tx.position.upsert).not.toHaveBeenCalled();
    expect(tx.asset.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { symbol: '600519.SH' } }),
    );
    expect(tx.ledgerEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'ADJUSTMENT',
          correctionOf: draftId,
          metadata: expect.objectContaining({ kind: 'opening-balance' }),
        }),
      }),
    );
  });
  it('回滚恢复导入前持仓并保留历史状态', async () => {
    const tx = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: '11111111-1111-4111-8111-111111111113',
          accountId: '11111111-1111-4111-8111-111111111111',
          status: 'committed',
          rows: [{ symbol: '600519.SH' }],
          beforeState: [{ symbol: '600519.SH', quantity: 100, costPrice: 10 }],
        })),
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
      position: { deleteMany: vi.fn(), create: vi.fn() },
      ledgerEvent: { upsert: vi.fn(async ({ create }: { create: object }) => create) },
    };
    const prisma = { $transaction: (operation: (client: typeof tx) => unknown) => operation(tx) };
    await new ImportService(prisma as never).rollback('draft');
    expect(tx.position.deleteMany).not.toHaveBeenCalled();
    expect(tx.position.create).not.toHaveBeenCalled();
    expect(tx.ledgerEvent.upsert).toHaveBeenCalledTimes(2);
    expect(tx.importDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    );
  });
});

describe('V0.1 核心 E2E', () => {
  it('账户→截图 Review/Commit→Portfolio→Risk→通知→AI Explain 可一键执行', async () => {
    const accountId = '00000000-0000-4000-8000-000000000001';
    const asset = {
      symbol: '600519.SH',
      name: '贵州茅台',
      market: 'CN',
      assetType: 'stock',
      currency: 'CNY',
    };
    const ledgerEvents: Array<Record<string, unknown>> = [];
    const positions: Array<Record<string, unknown>> = [];
    type DraftRecord = { id?: string; [key: string]: unknown };
    let draft: DraftRecord | null = null;
    type E2ePrisma = {
      [key: string]: unknown;
      $transaction: <T>(callback: (transaction: unknown) => Promise<T>) => Promise<T>;
    };
    const prisma: E2ePrisma = {
      account: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: accountId,
          active: true,
          ...data,
        })),
      },
      asset: {
        findUnique: vi.fn(async () => asset),
        findMany: vi.fn(async () => [asset]),
        upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => create),
      },
      position: { findMany: vi.fn(async () => positions) },
      importDraft: {
        findUnique: vi.fn(
          async ({ where }: { where: { id?: string; idempotencyKey?: string } }) => {
            if (where.id && draft?.id === where.id) return draft;
            return null;
          },
        ),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          draft = data;
          return data;
        }),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          draft = { ...draft, ...data };
          return draft;
        }),
      },
      ledgerEvent: {
        upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
          ledgerEvents.push(create);
          return create;
        }),
      },
      riskRule: {
        findMany: vi.fn(async () => [
          {
            id: 'risk-1',
            version: 1,
            kind: 'price-below',
            scope: 'security',
            severity: 'warning',
            threshold: 100,
            enabled: true,
            symbol: '600519.SH',
            accountId: null,
            effectiveAt: new Date(Date.now() - 1000),
          },
        ]),
      },
      riskEvent: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'risk-event-1',
          ...data,
        })),
      },
      $transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => callback(prisma),
    };
    const account = await new AccountsService(prisma as never).create({
      name: 'E2E 账户',
      source: 'manual',
      type: 'securities',
      currency: 'CNY',
    });
    expect(account).toMatchObject({ id: accountId });

    const ledger = {
      rebuild: vi.fn(async () => {
        positions.splice(0, positions.length, {
          accountId,
          symbol: '600519.SH',
          quantity: 100,
          costPrice: 1000,
          asset,
        });
      }),
    };
    const imports = new ImportService(prisma as never, ledger as never);
    const createdDraft = await imports.createDraftFromProvider(
      accountId,
      new Uint8Array([1, 2, 3]),
      'broker',
      {
        id: 'fixture-vision',
        extract: async () => [
          {
            symbol: '600519.SH',
            quantity: 100,
            costPrice: 1000,
            marketPrice: 1100,
            marketValue: 110_000,
            profit: 10_000,
            profitRate: 0.1,
            confidence: 0.99,
          },
        ],
      },
    );
    expect(createdDraft.status).toBe('pending');
    await imports.commit(createdDraft.id, createdDraft.rows as unknown as unknown[]);
    expect(ledgerEvents).toHaveLength(1);
    expect(ledgerEvents[0]).toMatchObject({ type: 'ADJUSTMENT', symbol: '600519.SH' });

    const portfolio = await new PortfolioService(
      prisma as never,
      { getQuote: async () => ({ price: 1100, stale: false }) } as never,
    ).value(accountId);
    expect(portfolio).toMatchObject({ totalMarketValue: 110_000, partial: false });

    const notifications = { enqueue: vi.fn(async () => [{ id: 'delivery-1' }]) };
    const risk = await new RiskService(prisma as never, notifications as never).scan([
      {
        symbol: '600519.SH',
        price: 90,
        costPrice: 1000,
        marketTime: '2025-01-02T01:30:00Z',
        dataQuality: { quote: 'fresh' },
      },
    ]);
    expect(risk.results).toEqual([{ ruleId: 'risk-1', eventId: 'risk-event-1' }]);
    expect(notifications.enqueue).toHaveBeenCalledWith(
      'risk-event-1',
      'warning',
      expect.any(Object),
    );

    const analysis = await runRiskExplanation(
      createCoreTools({
        getRisk: async () => ({ sourceId: 'risk-event-1', provider: 'fixture' }),
        getPortfolio: async () => portfolio,
        getPositions: async () => portfolio.positions,
        getQuote: async () => ({ price: 90 }),
        getBars: async () => [],
        getIndicators: async () => ({}),
        getChipDistribution: async () => ({}),
      }),
      { ruleId: 'risk-1', threshold: 100, triggerValue: 90 },
      new Set(['risk:read']),
    );
    expect(validateGroundedAnalysis(analysis).conclusion).toContain('触发值 90');
  });
});

describe('通知策略', () => {
  const policy = {
    channels: { warning: ['feishu'] },
    quietHours: { start: '22:00', end: '08:00', timezone: 'Asia/Shanghai' },
    cooldownMinutes: 30,
    maxAttempts: 3,
  };
  it('跨午夜静默时段有效', () =>
    expect(isQuietTime(new Date('2025-01-01T15:00:00Z'), policy)).toBe(true));
  it('白天不静默', () => expect(isQuietTime(new Date('2025-01-01T04:00:00Z'), policy)).toBe(false));
  it.each(['info', 'warning', 'error', 'critical'] as const)('路由 %s 严重级别', (severity) =>
    expect(
      channelsForSeverity(
        { ...policy, channels: { warning: ['fallback'], [severity]: [severity] } },
        severity,
      ),
    ).toEqual([severity]),
  );
  it('区分永久错误、重试和最终失败', () => {
    expect(classifyDeliveryError('feishu_http_400:bad', 1, 3).status).toBe('failed');
    expect(classifyDeliveryError('feishu_http_500:oops', 1, 3).status).toBe('retrying');
    expect(classifyDeliveryError('feishu_http_500:oops', 3, 3).status).toBe('failed');
  });
  it('低优先级事件可聚合为日报', () =>
    expect(
      buildDailyDigest([
        { title: 'A', body: 'a', severity: 'info', traceId: '1' },
        { title: 'B', body: 'b', severity: 'warning', traceId: '2' },
      ]),
    ).toMatchObject({ title: '风险摘要（2 条）', severity: 'info' }));
});

describe('风险事件与通知解耦', () => {
  it('规则修改递增版本并记录启停审计', async () => {
    const stored = {
      id: 'rule-1',
      version: 1,
      kind: 'price-below',
      scope: 'security',
      severity: 'warning',
      threshold: 10,
      enabled: true,
      symbol: '600519.SH',
      accountId: null,
      condition: null,
      parameters: null,
      config: null,
      effectiveAt: new Date('2025-01-01T00:00:00Z'),
    };
    const transaction = {
      riskRule: {
        findUniqueOrThrow: vi.fn(async () => stored),
        update: vi.fn(async () => ({ ...stored, version: 2, enabled: false })),
      },
      riskRuleAudit: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    };
    const updated = await new RiskService(prisma as never, {} as never).updateRule('rule-1', {
      enabled: false,
    });
    expect(updated).toMatchObject({ version: 2, enabled: false });
    expect(transaction.riskRuleAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ruleId: 'rule-1',
        ruleVersion: 2,
        action: 'disable',
        actor: 'local-user',
      }),
    });
  });
  it('通知排队失败时仍保留已写入的 RiskEvent 和 ruleVersion', async () => {
    const event = { id: 'event-1' };
    const prisma = {
      riskRule: {
        findMany: vi.fn(async () => [
          {
            id: 'rule-1',
            version: 3,
            kind: 'price-below',
            scope: 'security',
            severity: 'warning',
            threshold: 10,
            enabled: true,
            symbol: '600519.SH',
            accountId: null,
          },
        ]),
      },
      riskEvent: { create: vi.fn(async () => event) },
    };
    const notifications = { enqueue: vi.fn(async () => Promise.reject(new Error('redis down'))) };
    const result = await new RiskService(prisma as never, notifications as never).scan([
      {
        symbol: '600519.SH',
        price: 9,
        marketTime: '2025-01-01T01:00:00Z',
        dataQuality: { quote: 'fresh' },
      },
    ]);
    expect(prisma.riskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ruleVersion: 3, context: expect.any(Object) }),
      }),
    );
    expect(result.results).toEqual([
      expect.objectContaining({
        ruleId: 'rule-1',
        eventId: 'event-1',
        error: expect.stringMatching('通知'),
      }),
    ]);
  });
});

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

describe('AI 运行审计', () => {
  it('记录 context、Tool call、checkpoint 和 token/cost 汇总', async () => {
    const prisma = {
      aiRun: {
        create: vi.fn(async ({ data }: { data: object }) => ({ id: 'run-1', ...data })),
        update: vi.fn(async ({ data }: { data: object }) => ({ id: 'run-1', ...data })),
        findUnique: vi.fn(async () => ({ id: 'run-1', checkpoint: { step: 'critic' } })),
        findMany: vi.fn(async () => [
          { inputTokens: 10, outputTokens: 5, cost: 0.1 },
          { inputTokens: 20, outputTokens: 10, cost: 0.2 },
        ]),
      },
      aiToolCall: { create: vi.fn(async ({ data }: { data: object }) => data) },
      aiDecisionLog: {
        create: vi.fn(async ({ data }: { data: object }) => data),
        findMany: vi.fn(),
      },
    };
    const service = new AiRunService(prisma as never);
    await expect(
      service.start('mock', 'm1', 'research-v2', { scope: 'position', symbol: '600519.SH' }),
    ).resolves.toMatchObject({ id: 'run-1', context: { scope: 'position' } });
    await service.checkpoint('run-1', { step: 'research' });
    await service.recordToolCall({
      runId: 'run-1',
      tool: 'quote',
      permission: 'market:read',
      status: 'ok',
      inputSummary: '600519.SH',
      fetchedAt: '2025-01-01T00:00:00Z',
    });
    await expect(service.usageSummary()).resolves.toEqual({
      runs: 2,
      inputTokens: 30,
      outputTokens: 15,
      cost: 0.30000000000000004,
    });
    await expect(service.resume('run-1')).resolves.toMatchObject({
      checkpoint: { step: 'critic' },
    });
    await expect(service.list()).resolves.toHaveLength(2);
  });
  it('Decision Log 按标的保留研究时间线', async () => {
    const prisma = {
      aiDecisionLog: {
        create: vi.fn(async ({ data }: { data: object }) => ({ id: 'd1', ...data })),
        findMany: vi.fn(async () => [{ id: 'd1', symbol: '600519.SH' }]),
      },
    };
    const service = new AiRunService(prisma as never);
    await expect(
      service.createDecisionLog({
        symbol: '600519.SH',
        question: '风险?',
        assumptions: [],
        conclusion: { value: '谨慎' },
      }),
    ).resolves.toMatchObject({ symbol: '600519.SH' });
    await expect(service.listDecisionLogs('600519.SH')).resolves.toEqual([
      { id: 'd1', symbol: '600519.SH' },
    ]);
  });
});

describe('环境配置', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    DSA_BASE_URL: 'http://localhost:8000',
  };
  it('解析完整必需配置', () =>
    expect(parseConfig(base)).toMatchObject({ port: 3000, aiProvider: 'mock' }));
  it('缺失数据库配置时明确失败字段', () =>
    expect(() => parseConfig({ ...base, DATABASE_URL: undefined })).toThrow('DATABASE_URL'));
  it('输出中不包含 AI Key', () =>
    expect(JSON.stringify(parseConfig({ ...base, AI_API_KEY: 'secret-value' }))).not.toContain(
      'secret-value',
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
    expect(body).toMatchObject({ event: 'investment-os.error', traceId: 'trace-e2e' });
    expect(JSON.stringify(body)).not.toContain('portfolio');
    vi.unstubAllGlobals();
    if (previous === undefined) delete process.env.ERROR_TRACKING_URL;
    else process.env.ERROR_TRACKING_URL = previous;
  });
});

describe('行情缓存', () => {
  const quote = {
    open: 10,
    high: 11,
    low: 9,
    price: 10,
    previousClose: 10,
    volume: 1,
    amount: 10,
    marketTime: '2025-01-01T00:00:00Z',
    freshness: 'live',
    stale: false,
  };

  it('重复请求命中新鲜缓存且不重复调用 Provider', async () => {
    const values = new Map<string, string>();
    const dsa = { get: vi.fn(async () => quote) };
    const redis = {
      client: {
        get: vi.fn(async (key: string) => values.get(key) ?? null),
        multi: () => {
          const writes: Array<[string, string]> = [];
          const chain = {
            set: (key: string, value: string) => {
              writes.push([key, value]);
              return chain;
            },
            exec: async () => {
              for (const [key, value] of writes) values.set(key, value);
            },
          };
          return chain;
        },
      },
    };
    const service = new MarketService(dsa as never, redis as never);
    await service.getQuote('600519');
    await service.getQuote('600519');
    expect(dsa.get).toHaveBeenCalledTimes(1);
  });
  it('把 DSA Bar、Indicator 和 Chip 映射为统一契约', async () => {
    const timestamp = '2025-01-01T00:00:00Z';
    const dsa = {
      get: vi.fn(async (path: string) => {
        if (path.includes('/bars'))
          return [
            {
              timestamp,
              open: 10,
              high: 11,
              low: 9,
              close: 10,
              volume: 1,
              amount: 10,
            },
          ];
        if (path.includes('/indicators/'))
          return {
            parameters: { period: 14 },
            timeframe: '1d',
            marketTime: timestamp,
            calculatedAt: timestamp,
            values: { rsi14: 50 },
            engineVersion: 'fixture',
          };
        return {
          buckets: [{ price: 10, weight: 1 }],
          averageCost: 10,
          mainPeak: 10,
          profitRatio: 0.5,
          range70: [9, 11],
          range90: [8, 12],
          concentration: 0.4,
          engineVersion: 'fixture',
          calculatedAt: timestamp,
        };
      }),
    };
    const service = new MarketService(dsa as never, {} as never);
    await expect(service.getBars('600519', '1d')).resolves.toMatchObject([
      { symbol: '600519.SH', timeframe: '1d', provider: 'dsa' },
    ]);
    await expect(service.getIndicator('600519', 'RSI')).resolves.toMatchObject({
      name: 'RSI',
      provider: 'dsa',
    });
    await expect(service.getChip('600519')).resolves.toMatchObject({
      symbol: '600519.SH',
      provider: 'dsa',
      engineVersion: 'fixture',
    });
  });
});

describe('Provider 健康状态', () => {
  it('连续失败进入 down，恢复后回到 healthy，并持久化最近状态', async () => {
    const records = new Map<string, { consecutiveFailures: number }>();
    const prisma = {
      providerHealth: {
        findUnique: vi.fn(
          async ({ where }: { where: { provider: string } }) => records.get(where.provider) ?? null,
        ),
        upsert: vi.fn(
          async ({
            where,
            update,
          }: {
            where: { provider: string };
            update: { state: string; consecutiveFailures: number };
          }) => {
            records.set(where.provider, update);
            return { provider: where.provider, ...update };
          },
        ),
      },
    };
    const service = new ProviderHealthService(prisma as never, {} as never);
    await service.record('dsa', false, 10);
    await service.record('dsa', false, 20);
    await expect(service.record('dsa', false, 30)).resolves.toMatchObject({ state: 'down' });
    await expect(service.record('dsa', true, 10)).resolves.toMatchObject({
      state: 'healthy',
      consecutiveFailures: 0,
    });
  });
});

describe('行情落库与数据质量', () => {
  it('日线 Bar 幂等 upsert 且先建立 Asset Master', async () => {
    const upsertAsset = vi.fn(async () => ({}));
    const upsertBar = vi.fn(async ({ create }: { create: object }) => create);
    const prisma = {
      asset: { upsert: upsertAsset },
      marketBar: { upsert: upsertBar, findFirst: vi.fn() },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    };
    const quality = {};
    const service = new MarketStorageService(prisma as never, {} as never, quality as never);
    const bars = [
      {
        version: 1,
        symbol: '600519.SH',
        timeframe: '1d',
        timestamp: '2025-01-01T00:00:00Z',
        open: 10,
        high: 11,
        low: 9,
        close: 10,
        volume: 100,
        amount: 1000,
        provider: 'dsa',
      },
    ];
    await service.saveBars(bars);
    await service.saveBars(bars);
    expect(upsertAsset).toHaveBeenCalledTimes(2);
    expect(upsertBar).toHaveBeenCalledTimes(2);
    expect(upsertBar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ symbol_timeframe_timestamp_provider: expect.any(Object) }),
      }),
    );
  });
  it('增量同步从最新时间继续并过滤已落库 Bar', async () => {
    const upsertBar = vi.fn(async ({ create }: { create: object }) => create);
    const prisma = {
      asset: { upsert: vi.fn(async () => ({})) },
      marketBar: {
        upsert: upsertBar,
        findFirst: vi.fn(async () => ({ timestamp: new Date('2025-01-01T00:00:00Z') })),
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    };
    const market = {
      getBars: vi.fn(async () => [
        {
          version: 1,
          symbol: '600519.SH',
          timeframe: '1d',
          timestamp: '2025-01-01T00:00:00Z',
          open: 10,
          high: 11,
          low: 9,
          close: 10,
          volume: 1,
          amount: 10,
          provider: 'dsa',
        },
        {
          version: 1,
          symbol: '600519.SH',
          timeframe: '1d',
          timestamp: '2025-01-02T00:00:00Z',
          open: 10,
          high: 11,
          low: 9,
          close: 10,
          volume: 1,
          amount: 10,
          provider: 'dsa',
        },
      ]),
    };
    const service = new MarketStorageService(prisma as never, market as never, {} as never);
    await expect(
      service.syncBars({ symbol: '600519.SH', timeframe: '1d', mode: 'incremental' }),
    ).resolves.toMatchObject({ count: 1, mode: 'incremental' });
    expect(upsertBar).toHaveBeenCalledTimes(1);
    expect(market.getBars).toHaveBeenCalledWith('600519.SH', '1d', {
      start: '2025-01-01T00:00:00.000Z',
    });
  });
  it('历史回填保存 cursor/progress，可从中断点继续', async () => {
    const state = {
      id: 'backfill',
      symbol: '600519.SH',
      timeframe: '1d',
      start: new Date('2025-01-01'),
      end: new Date('2025-01-03'),
      cursor: null,
      status: 'queued',
      progress: 0,
      attempts: 0,
    };
    const prisma = {
      backfillJob: {
        create: vi.fn(async ({ data }: { data: object }) => ({ id: 'backfill', ...data })),
        findUniqueOrThrow: vi.fn(async () => state),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
          Object.assign(state, data),
        ),
      },
      asset: { upsert: vi.fn(async () => ({})) },
      marketBar: {
        upsert: vi.fn(async ({ create }: { create: object }) => create),
        findFirst: vi.fn(async () => null),
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    };
    const market = {
      getBars: vi.fn(async () => [
        {
          version: 1,
          symbol: '600519.SH',
          timeframe: '1d',
          timestamp: '2025-01-02T00:00:00Z',
          open: 10,
          high: 10,
          low: 10,
          close: 10,
          volume: 1,
          amount: 10,
          provider: 'dsa',
        },
      ]),
    };
    const quality = { record: vi.fn() };
    const service = new MarketStorageService(prisma as never, market as never, quality as never);
    await expect(service.runBackfill('backfill')).resolves.toMatchObject({
      status: 'queued',
      progress: 25,
    });
    expect(state.cursor).toBeInstanceOf(Date);
  });
  it('数据质量问题可查询并标记 resolved', async () => {
    const prisma = {
      dataQualityIssue: {
        findMany: vi.fn(async () => [{ id: 'issue', status: 'open' }]),
        findUnique: vi.fn(async () => ({ id: 'issue', status: 'open' })),
        update: vi.fn(async ({ data }: { data: object }) => ({ id: 'issue', ...data })),
        create: vi.fn(),
      },
    };
    const service = new DataQualityService(prisma as never);
    await expect(service.list('open')).resolves.toEqual([{ id: 'issue', status: 'open' }]);
    await expect(service.resolve('issue')).resolves.toMatchObject({ status: 'resolved' });
  });
});

describe('Ledger Snapshot 与收益摘要', () => {
  it('快照使用行情估值、Ledger 现金和 dataQuality，而不是成本替代市值', async () => {
    const snapshot = vi.fn(async ({ data }: { data: object }) => data);
    const prisma = {
      position: {
        findMany: vi.fn(async () => [
          {
            symbol: '600519.SH',
            quantity: 100,
            costPrice: 10,
            asset: { assetType: 'stock' },
          },
        ]),
      },
      ledgerEvent: {
        findMany: vi.fn(async () => [
          {
            id: 'deposit',
            accountId: 'a',
            type: 'CASH_DEPOSIT',
            occurredAt: new Date('2025-01-01'),
            symbol: null,
            quantity: null,
            price: null,
            amount: 1000,
            fee: null,
            tax: null,
          },
        ]),
      },
      portfolioSnapshot: { findFirst: vi.fn(async () => null), create: snapshot },
    };
    const market = {
      getQuote: vi.fn(async () => ({ price: 12, provider: 'dsa', stale: false })),
    };
    const result = await new PerformanceService(prisma as never, market as never).capture(
      'a',
      new Date('2025-01-02'),
    );
    expect(result).toMatchObject({ marketValue: 1200, costValue: 1000, cashValue: 1000 });
    expect(result.payload).toMatchObject({ dataQuality: { partial: false } });
  });
  it('目标配置按版本保存并拒绝总和不为 100%', async () => {
    const prisma = {
      targetAllocation: {
        updateMany: vi.fn(async () => ({})),
        findFirst: vi.fn(async () => ({ version: 2 })),
        create: vi.fn(async ({ data }: { data: object }) => ({ id: 'target', ...data })),
      },
    };
    const service = new PerformanceService(prisma as never, {} as never);
    await expect(service.saveTargets('portfolio', { 股票: 0.6, ETF: 0.4 })).resolves.toMatchObject({
      version: 3,
    });
    await expect(service.saveTargets('portfolio', { 股票: 0.7 })).rejects.toThrow('100%');
  });
  it('Security/Account/Portfolio 三层使用相同市值和缺失数据语义', async () => {
    const prisma = {
      position: {
        findMany: vi.fn(async () => [
          {
            accountId: 'a',
            symbol: '600519.SH',
            quantity: 100,
            costPrice: 10,
            asset: { assetType: 'stock' },
          },
          {
            accountId: 'b',
            symbol: '510300.SH',
            quantity: 100,
            costPrice: 5,
            asset: { assetType: 'etf' },
          },
        ]),
      },
    };
    const market = {
      getQuote: vi.fn(async (symbol: string) => ({ price: symbol === '600519.SH' ? 12 : 6 })),
    };
    const layers = await new PerformanceService(prisma as never, market as never).layers();
    expect(layers.security).toHaveLength(2);
    expect(layers.account).toMatchObject([
      { accountId: 'a', marketValue: 1200 },
      { accountId: 'b', marketValue: 600 },
    ]);
    expect(layers.portfolio).toMatchObject({ costValue: 1500, marketValue: 1800, partial: false });
  });
});

describe('Journal 与行为复盘', () => {
  it('按账户范围查询日志/计划，并输出反事实和周期复盘', async () => {
    const prisma = {
      journalEntry: {
        findMany: vi.fn(async () => [{ id: 'entry', accountId: 'a' }]),
        create: vi.fn(async ({ data }: { data: object }) => data),
        findUnique: vi.fn(async () => ({ id: 'entry' })),
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
      tradePlan: {
        findMany: vi.fn(async () => [{ id: 'plan', accountId: 'a' }]),
        create: vi.fn(async ({ data }: { data: object }) => data),
      },
    };
    const service = new JournalService(prisma as never);
    await expect(service.listEntries(undefined, 'a')).resolves.toEqual([
      { id: 'entry', accountId: 'a' },
    ]);
    await expect(service.listPlans(undefined, 'a')).resolves.toEqual([
      { id: 'plan', accountId: 'a' },
    ]);
    await expect(
      service.counterfactual({
        trades: [
          {
            symbol: '600519.SH',
            entryAt: '2025-01-01',
            exitAt: '2025-01-03',
            pnl: -10,
            entryPrice: 10,
          },
        ],
        enforceStop: true,
        stopPrice: 9.5,
      }),
    ).toMatchObject({ counterfactualPnl: -0.5 });
    const planned = service.plannedVsActual({
      symbol: '600519.SH',
      entryAt: '2025-01-01',
      exitAt: '2025-01-03',
      pnl: -10,
      plannedEntry: 10,
      entryPrice: 10.2,
      plannedExit: 11,
      exitPrice: 10.5,
      plannedHoldingDays: 1,
    });
    expect(planned.entryDeviation).toBeCloseTo(0.2);
    expect(planned.exitDeviation).toBeCloseTo(-0.5);
    expect(
      service.review({
        trades: [
          {
            symbol: '600519.SH',
            entryAt: '2025-01-01',
            exitAt: '2025-01-03',
            pnl: -10,
          },
        ],
        start: '2025-01-01',
        end: '2025-01-04',
      }),
    ).toMatchObject({ tradeCount: 1, behavior: { winRate: 0 } });
  });
});

describe('专业 Provider 配置', () => {
  it('保存配置时不回显密钥，连通性与额度状态可查询', async () => {
    const prisma = {
      providerConfig: {
        upsert: vi.fn(async ({ create }: { create: object }) => ({ name: 'tushare', ...create })),
        findUnique: vi.fn(async () => ({
          name: 'tushare',
          enabled: true,
          encryptedCredentials: Buffer.from('cipher'),
          quota: { limit: 100, used: 95 },
        })),
        findMany: vi.fn(async () => []),
      },
    };
    const service = new ProviderConfigService(prisma as never);
    const saved = await service.save({
      name: 'tushare',
      type: 'tushare',
      priority: 1,
      capabilities: ['quote', 'financials'],
      credentialsRef: 'secret-ref',
      quota: { limit: 100, used: 95 },
    });
    expect(saved).not.toHaveProperty('credentialsRef');
    await expect(service.test('tushare')).resolves.toMatchObject({ credentialConfigured: true });
    await expect(service.usage('tushare')).resolves.toMatchObject({
      state: 'warning',
      remaining: 5,
    });
  });
});

describe('Automation 工作流', () => {
  it('交易日感知、持仓事件过滤和批量风险扫描可复用手动逻辑', () => {
    expect(isTradingDay('2025-01-04T00:00:00Z')).toBe(false);
    expect(isTradingDay('2025-01-03T00:00:00Z')).toBe(true);
    expect(
      preMarketPositionEvents(
        [{ symbol: '600519.SH', quantity: 100 }],
        [
          { symbol: '600519.SH', kind: 'announcement' },
          { symbol: '000001.SZ', kind: 'news' },
        ],
      ),
    ).toHaveLength(1);
    const batches: number[] = [];
    expect(
      intradayRiskScan({
        contexts: [1, 2, 3, 4, 5],
        batchSize: 2,
        scan: (batch) => {
          batches.push(batch.length);
          return batch;
        },
      }),
    ).toEqual([1, 2, 3, 4, 5]);
    expect(batches).toEqual([2, 2, 1]);
  });
  it('日报、开盘扫描和健康告警保留数据限制', () => {
    const risk = dailyRiskSummary([{ severity: 'warning', triggered: true, status: 'active' }]);
    expect(dailyDigest({ date: '2025-01-03', events: [], risk, attention: [] })).toMatchObject({
      channels: ['feishu'],
    });
    expect(
      openingScan({
        asOf: '2025-01-03T01:30:00Z',
        quotes: [{ symbol: 'A', price: 11, previousClose: 10 }],
      }),
    ).toMatchObject({ limitations: ['no_l2_data'] });
    expect(
      dataHealthAlert({ providerStates: [{ provider: 'dsa', state: 'down' }], qualityIssues: [] })
        .alert,
    ).toBe(true);
    expect(
      weeklyStrategyReview({
        start: '2025-01-01',
        end: '2025-01-05',
        strategySignals: [],
        backtestChanges: [],
        executionLinks: [],
      }),
    ).toMatchObject({ recommendationTarget: 'research/decision-log' });
  });
});

describe('Ledger Service', () => {
  it('externalUid upsert 提供幂等事件写入', async () => {
    const upsert = vi.fn(async ({ where }: { where: object }) => where);
    await appendLedgerEvent({ ledgerEvent: { upsert } } as never, {
      version: 1,
      id: '11111111-1111-4111-8111-111111111115',
      accountId: '11111111-1111-4111-8111-111111111111',
      type: 'CASH_DEPOSIT',
      amount: 1000,
      occurredAt: '2025-01-01T00:00:00Z',
      source: 'manual',
      externalUid: 'bank-1',
      currency: 'CNY',
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountId_externalId: {
            accountId: '11111111-1111-4111-8111-111111111111',
            externalId: 'bank-1',
          },
        },
        update: {},
      }),
    );
  });
  it('rebuild 先清空旧投影再写入 Ledger 投影', async () => {
    const create = vi.fn(async ({ data }: { data: object }) => data);
    const transaction = { position: { deleteMany: vi.fn(), create } };
    const prisma = {
      ledgerEvent: {
        findMany: vi.fn(async () => [
          {
            id: 'buy',
            accountId: '11111111-1111-4111-8111-111111111111',
            type: 'BUY',
            occurredAt: new Date('2025-01-01'),
            symbol: '600519.SH',
            quantity: 100,
            price: 10,
            amount: null,
            fee: 0,
            tax: 0,
          },
        ]),
      },
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    };
    const result = await new LedgerService(prisma as never).rebuild(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result[0]).toMatchObject({ quantity: 100, averageCost: 10 });
    expect(transaction.position.deleteMany).toHaveBeenCalledWith({
      where: { accountId: '11111111-1111-4111-8111-111111111111' },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'ledger' }) }),
    );
  });
});

describe('Strategy 与 Backtest Worker', () => {
  const schema = {
    version: 1 as const,
    name: 'test',
    universe: { symbols: ['600519.SH'], asOf: '2025-01-01T00:00:00Z' },
    entrySignals: [{ indicator: 'close', operator: 'gt' as const, value: 10 }],
    exitSignals: [{ indicator: 'close', operator: 'lt' as const, value: 9 }],
    stopLoss: { type: 'fixed' as const, value: 0.1 },
    sizing: { type: 'weight' as const, value: 0.5 },
    execution: { price: 'close' as const, tPlusOne: true, lotSize: 100 },
    cost: { commissionRate: 0.0003, minimumCommission: 5, stampDutyRate: 0.0005, slippageRate: 0 },
    riskConstraints: [],
    benchmark: '000300.SH',
  };
  it('策略创建与版本修改不覆盖旧版本', async () => {
    const create = vi.fn(async ({ data }: { data: object }) => data);
    const createVersion = vi.fn(async ({ data }: { data: object }) => data);
    const prisma = {
      strategy: { create },
      strategyVersion: {
        aggregate: vi.fn(async () => ({ _max: { version: 1 } })),
        create: createVersion,
      },
    };
    const service = new BacktestService(prisma as never);
    await service.createStrategy('test', schema);
    await service.createVersion('11111111-1111-4111-8111-111111111116', schema);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'draft' }) }),
    );
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 2 }) }),
    );
  });
  it('Worker 运行任务并保存 checksum、进度和结果', async () => {
    const job = {
      id: '11111111-1111-4111-8111-111111111117',
      strategyVersionId: '11111111-1111-4111-8111-111111111116',
      status: 'queued',
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-02'),
      dataAsOf: new Date('2025-01-03'),
      input: { strategy: schema, bars: [], initialCash: 1000 },
      strategyVersion: { version: 2, schemaVersion: 1 },
    };
    const updates: object[] = [];
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => job),
        update: vi.fn(async ({ data }: { data: object }) => {
          updates.push(data);
          return { ...job, ...data };
        }),
      },
    };
    const worker = {
      id: 'mock-worker',
      run: vi.fn(async () => ({
        metrics: { cumulativeReturn: 0 },
        trades: [],
        returns: [0.01, -0.01],
      })),
    };
    const result = await new BacktestService(prisma as never).run(job.id, worker as never);
    expect(result).toMatchObject({
      status: 'succeeded',
      progress: 100,
      resultChecksum: expect.any(String),
    });
    expect(updates).toHaveLength(2);
    expect(worker.run).toHaveBeenCalledOnce();
    expect(result.result).toMatchObject({
      metadata: { strategyVersionId: job.strategyVersionId, strategyVersion: 2, schemaVersion: 1 },
      analytics: { sharpe: expect.any(Number) },
    });
  });
  it('取消运行中任务会中止 Worker 且不写成功结果', async () => {
    const job = {
      id: '11111111-1111-4111-8111-111111111118',
      strategyVersionId: '11111111-1111-4111-8111-111111111116',
      status: 'queued',
      progress: 0,
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-02'),
      dataAsOf: new Date('2025-01-03'),
      input: { strategy: schema, bars: [], initialCash: 1000 },
      strategyVersion: { version: 1, schemaVersion: 1 },
    };
    let state = { ...job };
    const updates: Array<Record<string, unknown>> = [];
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => state),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          state = { ...state, ...data };
          return state;
        }),
      },
    };
    const worker = {
      id: 'slow-worker',
      run: vi.fn(
        async (_input: unknown, signal: AbortSignal) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('回测已取消')), { once: true });
          }),
      ),
    };
    const service = new BacktestService(prisma as never);
    const running = service.run(job.id, worker as never);
    await Promise.resolve();
    await service.cancel(job.id);
    await running;
    expect(state.status).toBe('cancelled');
    expect(updates.some((update) => update.status === 'succeeded')).toBe(false);
  });
});

describe('账户与组合', () => {
  it('拒绝重复账户、非法币种和有持仓账户停用', async () => {
    const prisma = {
      account: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'duplicate' })
          .mockResolvedValueOnce({ id: 'with-position', positions: [{}] }),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    const service = new AccountsService(prisma as never);
    await expect(
      service.create({ name: '证券', source: 'manual', type: 'securities', currency: 'CNY' }),
    ).rejects.toThrow('已存在');
    await expect(
      service.create({ name: '非法', source: 'manual', type: 'securities', currency: 'EUR' }),
    ).rejects.toThrow();
    await expect(service.deactivate('with-position')).rejects.toThrow('仍有持仓');
  });

  it('用三持仓 fixture 计算部分估值和盈亏', async () => {
    const positions = [
      { id: '1', symbol: '600519.SH', quantity: 100, costPrice: 10, asset: { name: 'A' } },
      { id: '2', symbol: '000001.SZ', quantity: 200, costPrice: 5, asset: { name: 'B' } },
      { id: '3', symbol: '510300.SH', quantity: 100, costPrice: 4, asset: { name: 'C' } },
    ];
    const prisma = { position: { findMany: vi.fn(async () => positions) } };
    const market = {
      getQuote: vi.fn(async (symbol: string) => {
        if (symbol === '510300.SH') throw new Error('missing');
        return { price: symbol === '600519.SH' ? 12 : 4, stale: false };
      }),
    };
    const result = await new PortfolioService(prisma as never, market as never).value();
    expect(result).toMatchObject({
      totalCost: 2400,
      totalMarketValue: 2000,
      totalPnl: 0,
      partial: true,
    });
    expect(result.positions[2]).toMatchObject({ marketValue: null, stale: true });
  });
  it('编辑持仓可同时修正账户、数量和成本', async () => {
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'position',
        accountId: '11111111-1111-4111-8111-111111111111',
        symbol: '600519.SH',
        quantity: 100,
        costPrice: 10,
      })
      .mockResolvedValueOnce({ id: 'position', symbol: '600519.SH', quantity: 200, costPrice: 12 });
    const setPosition = vi.fn(async () => ({}));
    const service = new PortfolioService(
      { position: { findUniqueOrThrow } } as never,
      {} as never,
      { setPosition } as never,
    );
    await service.updatePosition('position', {
      accountId: '11111111-1111-4111-8111-111111111111',
      quantity: 200,
      costPrice: 12,
    });
    expect(setPosition).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '600519.SH',
      200,
      12,
      'manual',
      '手工修改持仓',
    );
    await expect(service.updatePosition('position', { quantity: 0 })).rejects.toThrow();
  });
});

describe('自动化基础', () => {
  it('按 Asia/Shanghai 时区计算下次 cron 时间', () =>
    expect(
      nextCronOccurrence(
        '30 9 * * *',
        'Asia/Shanghai',
        new Date('2025-01-01T01:29:30Z'),
      ).toISOString(),
    ).toBe('2025-01-01T01:30:00.000Z'));
  it('支持常用的 step 与 range/step cron 表达式', () => {
    expect(
      nextCronOccurrence('*/5 * * * *', 'Asia/Shanghai', new Date('2025-01-01T01:29:30Z')),
    ).toEqual(new Date('2025-01-01T01:30:00Z'));
    expect(
      nextCronOccurrence('30-40/5 * * * *', 'Asia/Shanghai', new Date('2025-01-01T01:29:30Z')),
    ).toEqual(new Date('2025-01-01T01:30:00Z'));
  });
  it('两次失败后按 backoff 重试成功', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('one'))
      .mockRejectedValueOnce(new Error('two'))
      .mockResolvedValue('ok');
    const waits: number[] = [];
    await expect(
      runWithRetry(operation, { maxAttempts: 3, backoffMs: 10 }, async (milliseconds) => {
        waits.push(milliseconds);
      }),
    ).resolves.toEqual({ result: 'ok', attempts: 3 });
    expect(waits).toEqual([10, 20]);
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
