import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomationRuntimeHandlers } from '../../src/automation/automation-runtime.service.js';
import { AutomationService } from '../../src/automation/automation.service.js';
import { AutomationWorkflowRunner } from '../../src/automation/workflow-runner.service.js';
import { RiskService } from '../../src/risk/risk.service.js';

const databaseUrl = process.env.RISK_VALUATION_DATABASE_URL;
const at = new Date('2026-10-18T08:00:00.000Z');

function controlledQuote(symbol: string, missingPrice: boolean) {
  if (missingPrice && symbol === 'RVC_CNY.SH') throw new Error('受控缺价');
  const usd = symbol === 'RVC_USD.US';
  return {
    symbol,
    price: usd ? 100 : 700,
    marketTime: at.toISOString(),
    provider: 'controlled',
    freshness: 'live',
    stale: false,
    units: { priceCurrency: usd ? 'USD' : 'CNY' },
  };
}

function controlledMarketTransport() {
  const flags = { missingPrice: false, missingFx: false };
  const market = {
    getQuote: async (symbol: string) => controlledQuote(symbol, flags.missingPrice),
    getFxRates: async () => ({
      version: 3,
      baseCurrency: 'CNY',
      asOf: '2026-10-18',
      fetchedAt: at.toISOString(),
      maxAgeDays: 3,
      rates: [
        {
          fromCurrency: 'USD',
          toCurrency: 'CNY',
          rate: flags.missingFx ? undefined : 7,
          available: !flags.missingFx,
          rateDate: '2026-10-18',
          provider: 'controlled',
          ageDays: 0,
          freshness: flags.missingFx ? 'unavailable' : 'live',
          stale: false,
        },
      ],
    }),
  };
  return { flags, market };
}

describe.skipIf(!databaseUrl)('真实风险 handler、规则、状态和诊断的 PostgreSQL 联通', () => {
  let prisma: PrismaClient;
  let risk: RiskService;
  let automations: AutomationService;
  let handlers: AutomationRuntimeHandlers;
  let jobId: string;
  let accountA: string;
  let accountB: string;
  let concentrationId: string;
  let localId: string;
  let priceId: string;
  const notifications = {
    enqueue: vi.fn<(subject: { type: string; id: string }, ...rest: unknown[]) => Promise<never[]>>(
      async () => [],
    ),
    subjectDeliveryStatus: vi.fn(async () => ({ shouldRetry: false })),
  };
  const { flags, market } = controlledMarketTransport();

  beforeAll(async () => {
    const url = new URL(databaseUrl ?? '');
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/portfolio_valuation_fixture')
      throw new Error('仅允许明确的正确性隔离数据库');
    prisma = new PrismaClient({ datasourceUrl: url.toString() });
    expect(
      await prisma.$queryRaw`SELECT current_database() AS database, current_user AS owner`,
    ).toEqual([{ database: 'portfolio_valuation_fixture', owner: 'fixture_owner' }]);
    await prisma.riskRule.updateMany({ data: { enabled: false } });
    const accounts = await Promise.all(
      ['甲', '乙'].map((name) =>
        prisma.account.create({
          data: { name: `风险隔离${name}`, type: 'securities', mode: 'actual' },
        }),
      ),
    );
    accountA = accounts[0]!.id;
    accountB = accounts[1]!.id;
    for (const [symbol, currency, accountId] of [
      ['RVC_USD.US', 'USD', accountA],
      ['RVC_CNY.SH', 'CNY', accountB],
    ] as const) {
      await prisma.asset.create({
        data: {
          symbol,
          currency,
          name: '风险合成输入',
          assetType: 'stock',
          market: currency === 'USD' ? 'US' : 'CN',
        },
      });
      await prisma.position.create({
        data: { symbol, accountId, quantity: 1, costPrice: 100, source: 'isolated-fixture' },
      });
    }
    const base = {
      version: 1,
      scope: 'security',
      severity: 'warning',
      enabled: true,
      symbol: 'RVC_USD.US',
      needsRepair: false,
    };
    concentrationId = (
      await prisma.riskRule.create({
        data: { ...base, kind: 'position-concentration', threshold: 0.4 },
      })
    ).id;
    localId = (
      await prisma.riskRule.create({
        data: { ...base, kind: 'position-concentration', threshold: 0.4, accountId: accountA },
      })
    ).id;
    priceId = (
      await prisma.riskRule.create({ data: { ...base, kind: 'price-below', threshold: 150 } })
    ).id;
    risk = new RiskService(prisma as never, notifications as never);
    const workflows = new AutomationWorkflowRunner(
      {} as never,
      {} as never,
      risk,
      prisma as never,
      market as never,
    );
    handlers = new AutomationRuntimeHandlers(
      prisma as never,
      workflows,
      market as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    automations = new AutomationService(prisma as never, {} as never, notifications as never);
    jobId = (
      await prisma.automationJob.create({
        data: {
          name: '风险正确性隔离扫描',
          type: 'risk-evaluation',
          cron: '0 0 * * *',
          timezone: 'Asia/Shanghai',
          enabled: false,
          lockTtlMs: 30000,
          retryPolicy: { maxAttempts: 1, backoffMs: 1 },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const run = () => automations.execute(jobId, handlers.for('risk-evaluation'), at);

  beforeEach(async () => {
    flags.missingPrice = false;
    flags.missingFx = false;
    notifications.enqueue.mockClear();
    const where = { ruleId: { in: [concentrationId, localId, priceId] } };
    await prisma.$transaction([
      prisma.riskRuleTriggerState.deleteMany({ where }),
      prisma.riskEvent.deleteMany({ where }),
    ]);
  });

  it('完整估值进入真实规则及持久事件；权重分别为50%和100%', async () => {
    const result = await run();
    expect(result).toMatchObject({ output: { valuation: { portfolioComplete: true } } });
    const events = await prisma.riskEvent.findMany({
      where: { ruleId: { in: [concentrationId, localId] } },
    });
    expect(events).toHaveLength(2);
    for (const event of events) {
      const context = event.context as { value: number };
      expect(context.value).toBe(event.ruleId === localId ? 1 : 0.5);
      expect(event.triggered).toBe(true);
    }
    expect(
      (await prisma.riskRuleTriggerState.findFirstOrThrow({ where: { ruleId: concentrationId } }))
        .activeEventId,
    ).not.toBeNull();
  });

  it('缺价时跳过组合权重，保留既有风险；独立账户和价格仍评估，历史读链保留原因', async () => {
    await run();
    flags.missingPrice = true;
    notifications.enqueue.mockClear();
    const state = await prisma.riskRuleTriggerState.findFirstOrThrow({
      where: { ruleId: concentrationId },
    });
    const count = await prisma.riskEvent.count({ where: { ruleId: concentrationId } });
    const output = await run();
    expect(output).toMatchObject({
      output: {
        valuation: { portfolioComplete: false },
        results: expect.arrayContaining([
          { ruleId: concentrationId, error: expect.stringContaining('组合权重不可用') },
        ]),
      },
    });
    expect(
      await prisma.riskRuleTriggerState.findUniqueOrThrow({ where: { id: state.id } }),
    ).toEqual(state);
    expect(await prisma.riskEvent.count({ where: { ruleId: concentrationId } })).toBe(count);
    expect(
      notifications.enqueue.mock.calls.some(([subject]) => subject.id === state.activeEventId),
    ).toBe(false);
    const history = await automations.history(jobId);
    expect(JSON.stringify(history)).toContain('组合权重不可用');
    const states = await prisma.riskRuleTriggerState.findMany({
      where: { ruleId: { in: [priceId, localId] } },
    });
    expect(states).toHaveLength(2);
    expect(states.every((row) => row.activeEventId !== null)).toBe(true);
    expect(output).toMatchObject({
      output: {
        results: expect.arrayContaining([
          { ruleId: priceId, eventId: expect.any(String) },
          { ruleId: localId, eventId: expect.any(String) },
        ]),
      },
    });
  });

  it('FX 缺失保持同样的事件保护，组合与单币账户分别诊断', async () => {
    await run();
    flags.missingFx = true;
    const state = await prisma.riskRuleTriggerState.findFirstOrThrow({
      where: { ruleId: concentrationId },
    });
    const result = await run();
    expect(result).toMatchObject({
      output: {
        valuation: {
          portfolioComplete: false,
          accounts: expect.arrayContaining([
            { accountId: accountA, complete: true, baseCurrency: 'USD', reason: null },
          ]),
        },
      },
    });
    expect(
      await prisma.riskRuleTriggerState.findUniqueOrThrow({ where: { id: state.id } }),
    ).toEqual(state);
    expect(await prisma.notificationDelivery.count()).toBe(0);
  });
});
