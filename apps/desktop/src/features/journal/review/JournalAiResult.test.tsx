import { renderToStaticMarkup } from 'react-dom/server';
import type { JournalAiExplanation } from '@thesis-ledger/schemas';
import { describe, expect, it } from 'vitest';
import { JournalAiResult } from './JournalAiResult.js';

type Result = NonNullable<JournalAiExplanation['result']>;
const id = '00000000-0000-4000-8000-000000000011';

describe('Journal AI 解读历史与 V2 展示', () => {
  it('V2 展示结论、可核对证据、风险与未知，不伪造 V1 Tool 引用', () => {
    const result = {
      version: 2,
      inference: {
        conclusion: '复盘结论',
        rationale: ['严格区分计划与实际'],
        claims: [{ id: 'claim-1', description: '已核对事实', evidenceIds: [id] }],
        invalidationConditions: [{ id: 'condition-1', description: '需补充成交资料' }],
        risks: ['数据缺失'],
        unknowns: ['止损触发不可确认'],
        disclaimer: '不构成交易建议',
      },
      evidenceBindings: [{ audit: { evidenceId: id, sourceIds: ['journal:verified-fixture'] } }],
    } as unknown as Result;
    const html = renderToStaticMarkup(<JournalAiResult result={result} />);
    for (const phrase of [
      '复盘结论',
      '严格区分计划与实际',
      '已核对事实',
      'journal:verified-fixture',
      '需补充成交资料',
      '数据缺失',
      '止损触发不可确认',
      '不构成交易建议',
    ])
      expect(html).toContain(phrase);
    expect(html).not.toContain('来源记录');
  });

  it('历史 V1 仍展示其原有工具来源引用', () => {
    const result = {
      version: 1,
      conclusion: '旧复盘',
      evidence: [{ claim: '旧依据', citations: [{ sourceId: 'journal:old', toolCallId: id }] }],
      risks: ['历史风险'],
      unknowns: ['历史未知'],
      disclaimer: '旧声明',
    } as unknown as Result;
    const html = renderToStaticMarkup(<JournalAiResult result={result} />);
    for (const phrase of ['旧复盘', '旧依据', 'journal:old', id, '历史风险', '历史未知', '旧声明'])
      expect(html).toContain(phrase);
  });
});
