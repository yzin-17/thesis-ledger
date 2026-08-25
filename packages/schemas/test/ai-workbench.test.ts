import { describe, expect, it } from 'vitest';
import {
  aiCapabilitiesResponseSchema,
  aiResearchContextSchema,
  aiResearchStartInputSchema,
} from '../src/index.js';

describe('AI 研究工作台契约', () => {
  it('接受四种精确研究范围，并保留组合 ID', () => {
    expect(
      aiResearchContextSchema.parse({ scope: 'portfolio', portfolioId: 'portfolio-1' }),
    ).toEqual({
      scope: 'portfolio',
      portfolioId: 'portfolio-1',
    });
    expect(aiResearchContextSchema.parse({ scope: 'account', accountId: 'account-1' })).toEqual({
      scope: 'account',
      accountId: 'account-1',
    });
    expect(
      aiResearchContextSchema.parse({
        scope: 'position',
        accountId: 'account-1',
        symbol: '600519.SH',
      }),
    ).toEqual({
      scope: 'position',
      accountId: 'account-1',
      symbol: '600519.SH',
    });
    expect(
      aiResearchContextSchema.parse({ scope: 'strategy', strategyVersionId: 'version-1' }),
    ).toEqual({
      scope: 'strategy',
      strategyVersionId: 'version-1',
    });
  });

  it('拒绝缺失实体 ID、范围冲突字段、空白问题和未知模板', () => {
    expect(() => aiResearchContextSchema.parse({ scope: 'account' })).toThrow();
    expect(() =>
      aiResearchContextSchema.parse({ scope: 'position', symbol: '600519.SH' }),
    ).toThrow();
    expect(() =>
      aiResearchContextSchema.parse({
        scope: 'strategy',
        strategyVersionId: 'v1',
        accountId: 'a1',
      }),
    ).toThrow();
    expect(() =>
      aiResearchStartInputSchema.parse({ question: '  ', context: { scope: 'portfolio' } }),
    ).toThrow();
    expect(() =>
      aiResearchStartInputSchema.parse({
        question: 'x'.repeat(2001),
        context: { scope: 'portfolio' },
      }),
    ).toThrow();
    expect(() =>
      aiResearchStartInputSchema.parse({
        question: '风险？',
        context: { scope: 'portfolio' },
        templateId: 'unknown',
      }),
    ).toThrow();
  });

  it('会 trim 问题并校验重试来源为 UUID', () => {
    expect(
      aiResearchStartInputSchema.parse({
        question: '  当前风险？  ',
        context: { scope: 'portfolio' },
        retryOfRunId: '11111111-1111-4111-8111-111111111111',
      }),
    ).toMatchObject({ question: '当前风险？' });
    expect(() =>
      aiResearchStartInputSchema.parse({
        question: '风险？',
        context: { scope: 'portfolio' },
        retryOfRunId: 'run-1',
      }),
    ).toThrow();
  });

  it('表达 Provider 能力状态、缺失影响和启动条件', () => {
    expect(
      aiCapabilitiesResponseSchema.parse({
        canStart: true,
        providers: [
          {
            provider: 'fixture',
            state: 'demo',
            models: ['research-fixture'],
            tools: ['getRisk'],
            missing: [],
            impact: ['仅供演示'],
          },
        ],
        checkedAt: '2026-08-26T00:00:00Z',
      }),
    ).toMatchObject({ canStart: true });
  });
});
