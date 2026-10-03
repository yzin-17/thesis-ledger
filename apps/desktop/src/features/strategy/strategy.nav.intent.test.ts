import { backtestNavRunConfigV3Schema } from '@thesis-ledger/schemas';
import { describe, expect, it } from 'vitest';
import {
  createNavPreparationRequest,
  domesticNavResearchDecisionRaw,
  type NavPreparationIntentInput,
} from './strategy.nav.intent.js';

const hash = 'a'.repeat(64);
const symbol = '161725.OF';

describe('国内研究规则适用范围', () => {
  const input = {
    symbol,
    applicableRange: { startDate: '2026-09-02', endDate: '2026-09-15' },
    runWindow: { startDate: '2026-09-08', endDate: '2026-09-15' },
    configuredAt: '2026-10-01T00:00:00.000Z',
    decision: ' 明确覆盖预热及运行区间 ',
  };
  it('保留明确确认的预热范围和披露延迟，不缩到运行开始日', () => {
    expect(JSON.parse(domesticNavResearchDecisionRaw(input))).toMatchObject({
      applicableRange: input.applicableRange,
      delayWorkdays: 1,
      decision: '明确覆盖预热及运行区间',
    });
  });
  it('只有运行范围、未填日期或结束过早时在准备前拒绝', () => {
    for (const applicableRange of [
      input.runWindow,
      { startDate: '', endDate: '2026-09-15' },
      { startDate: '2026-09-02', endDate: '2026-09-14' },
    ]) {
      expect(() => domesticNavResearchDecisionRaw({ ...input, applicableRange })).toThrow('预热');
    }
  });
});

const executionModel = () => ({
  schemaVersion: 'execution-model-v1',
  id: 'nav-model',
  version: '1',
  scope: {
    symbol,
    market: 'CN',
    instrumentType: 'NAV_FUND',
    currency: 'CNY',
    timezone: 'Asia/Shanghai',
    range: { start: '2025-01-02', end: '2025-01-03' },
  },
  segments: [
    {
      id: 'nav-2025',
      range: { start: '2025-01-02', end: '2025-01-03' },
      source: {
        kind: 'researchPreset',
        description: 'intent test model',
        references: ['fixture://fee-model'],
        revision: '1',
        configuredAt: '2025-01-01T00:00:00.000Z',
      },
      assumptions: ['explicitly configured NAV execution assumptions'],
      fees: null,
      execution: {
        mode: 'nav',
        calendarMarket: 'CN',
        cutoffLocalTime: '14:00',
        cutoffBoundary: 'atOrAfterNextTradingDay',
        navDate: 'acceptedApplicationTradingDate',
        navAvailability: 'providerAvailableAt',
        reserveCashAt: 'orderAccepted',
        subscriptionDebitAt: 'confirmation',
        confirmationAfterTradingDays: 1,
        sellableAfterConfirmationTradingDays: 1,
        redemptionReinvestableAfterConfirmationTradingDays: 2,
        subscriptionFee: {
          treatment: 'charged',
          side: 'buy',
          basis: 'subscriptionApplicationAmount',
          currency: 'CNY',
          rate: '0.01',
          minimum: { kind: 'none' },
          rounding: { mode: 'halfUp', decimalPlaces: 2 },
          collection: 'perApplication',
          collectedAt: 'confirmation',
        },
        redemptionFee: {
          treatment: 'charged',
          side: 'sell',
          basis: 'redemptionGrossProceeds',
          currency: 'CNY',
          rate: '0.01',
          minimum: { kind: 'none' },
          rounding: { mode: 'halfUp', decimalPlaces: 2 },
          collection: 'perApplication',
          collectedAt: 'confirmation',
        },
      },
    },
  ],
});

const fullConfig = backtestNavRunConfigV3Schema.parse({
  schemaVersion: '3',
  startDate: '2025-01-02',
  endDate: '2025-01-03',
  dataAsOf: '2025-01-08T00:00:00.000Z',
  baseCurrency: 'CNY',
  initialCash: { CNY: '10000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '20:00',
    pricePolicy: 'latestAvailable',
    fxPolicy: 'latestAvailable',
  },
  executionModel: executionModel(),
  navInput: { kind: 'nav', symbol },
  navVisibility: {
    mode: 'research-assumption',
    boundary: 'after-disclosure-day-end',
    timezone: 'Asia/Shanghai',
    disclosureCalendarHash: hash,
    rule: {
      id: 'rule',
      version: '1',
      symbol,
      fundType: 'domestic',
      applicableRange: { startDate: '2025-01-02', endDate: '2025-01-03' },
      delayWorkdays: 1,
      basis: 'domestic-default',
      evidenceRef: 'fixture://rule',
      documentHash: hash,
      contentHash: hash,
      configuredAt: '2025-01-01T00:00:00.000Z',
    },
  },
});
const { dataAsOf: _dataAsOf, navVisibility: _navVisibility, ...runConfig } = fullConfig;
void _dataAsOf;
void _navVisibility;

const calendarDecisionRaw = JSON.stringify({
  schemaVersion: 'nav-research-calendar-decision-v1',
  symbol,
  basis: 'nav-dates-xshg-intersection-v1',
  configuredAt: '2025-01-01T00:00:00.000Z',
  decision: 'The supplied fund NAV dates are intersected with the confirmed XSHG calendar.',
});
const domesticRuleDecisionRaw = JSON.stringify({
  schemaVersion: 'nav-research-default-v1',
  symbol,
  fundType: 'domestic',
  delayWorkdays: 1,
  applicableRange: { startDate: '2025-01-02', endDate: '2025-01-03' },
  configuredAt: '2025-01-01T00:00:00.000Z',
  decision: 'The user explicitly accepts one workday after disclosure as a research assumption.',
});

const baseInput = {
  requestId: 'nav-intent-test',
  strategyVersionId: '00000000-0000-4000-8000-000000000002',
  runConfig,
  calendarDecisionRaw,
};

describe('NAV 准备意图', () => {
  it('只有显式确认日历与国内 T+1 假设后才输出准备请求', () => {
    expect(() =>
      createNavPreparationRequest({
        ...baseInput,
        fundType: 'domestic',
        domesticRuleDecisionRaw,
        calendarDecisionConfirmed: true,
        domesticRuleDecisionConfirmed: false,
      }),
    ).toThrow('请先确认国内基金 T+1 研究假设。');

    const request = createNavPreparationRequest({
      ...baseInput,
      fundType: 'domestic',
      domesticRuleDecisionRaw,
      calendarDecisionConfirmed: true,
      domesticRuleDecisionConfirmed: true,
    });
    expect(request.calendarDecisionRaw).toBe(calendarDecisionRaw);
    expect(request.domesticRuleDecisionRaw).toBe(domesticRuleDecisionRaw);
    expect(request.visibilityMode).toBe('research-assumption');
    expect(request.freezeTimePolicy).toBe('after-acquisition');
  });

  it('要求确认日历决定，且不接受按 fundType 默认确认', () => {
    expect(() =>
      createNavPreparationRequest({
        ...baseInput,
        fundType: 'qdii',
        domesticRuleDecisionRaw: null,
        calendarDecisionConfirmed: false,
      }),
    ).toThrow('请先确认净值研究日历决策。');
  });

  it('QDII 保留显式类别和日历决定，并将国内规则保持为空', () => {
    const request = createNavPreparationRequest({
      ...baseInput,
      fundType: 'qdii',
      domesticRuleDecisionRaw: null,
      calendarDecisionConfirmed: true,
    });
    expect(request.fundType).toBe('qdii');
    expect(request.calendarDecisionRaw).toBe(calendarDecisionRaw);
    expect(request.domesticRuleDecisionRaw).toBeNull();
  });

  it('拒绝缺失的显式基金类别', () => {
    const invalidInput = {
      ...baseInput,
      domesticRuleDecisionRaw: null,
      calendarDecisionConfirmed: true,
    } as unknown as NavPreparationIntentInput;
    expect(() => createNavPreparationRequest(invalidInput)).toThrow('请明确选择基金类别。');
  });
});
