import { describe, expect, it } from 'vitest';
import { researchResultSchema } from '../src/index.js';

const time = '2025-01-01T01:00:00Z';

const baseResult = {
  version: 1 as const,
  provider: 'dsa-fork',
  symbol: '600519.SH',
  conclusion: '证据不足，保持观察。',
  evidence: [
    {
      claim: '最新报价可用',
      citations: [
        {
          tool: 'quote',
          sourceId: '600519.SH',
          provider: 'dsa-fork',
          observedAt: time,
          marketTime: time,
          fetchedAt: time,
        },
      ],
    },
  ],
  risks: ['数据源可能延迟'],
  unknowns: [],
  disclaimer: '仅供研究参考，不构成投资建议。',
  context: { scope: 'position' as const, symbol: '600519.SH' },
  createdAt: time,
};

describe('ResearchResult V1', () => {
  it('复用 AI evidence contract 并补齐默认 signals', () => {
    const parsed = researchResultSchema.parse(baseResult);
    expect(parsed.provider).toBe('dsa-fork');
    expect(parsed.signals).toEqual([]);
    expect(parsed.evidence[0]?.citations[0]?.provider).toBe('dsa-fork');
  });

  it('拒绝越界评分和无引用证据', () => {
    expect(() => researchResultSchema.parse({ ...baseResult, score: 101 })).toThrow();
    expect(() =>
      researchResultSchema.parse({
        ...baseResult,
        evidence: [{ claim: '无法验证', citations: [] }],
      }),
    ).toThrow();
  });
});
