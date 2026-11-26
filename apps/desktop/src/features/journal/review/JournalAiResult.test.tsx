import { renderToStaticMarkup } from 'react-dom/server';
import { journalAiExplanationSchema, type JournalAiExplanation } from '@thesis-ledger/schemas';
import { describe, expect, it } from 'vitest';
import { JournalAiResult } from './JournalAiResult.js';

type Result = NonNullable<JournalAiExplanation['result']>;
const id = '00000000-0000-4000-8000-000000000011';

describe('复盘 AI 解读', () => {
  it('现行解读展示结论、可核对证据、风险与未知', () => {
    const result = {
      version: 'research-report-result-v1',
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

  it('读取边界拒绝退役的解读结果版本', () => {
    const result = {
      version: 1,
      conclusion: '旧复盘',
      evidence: [{ claim: '旧依据', citations: [{ sourceId: 'journal:old', toolCallId: id }] }],
      risks: ['历史风险'],
      unknowns: ['历史未知'],
      disclaimer: '旧声明',
    };
    expect(journalAiExplanationSchema.shape.result.safeParse(result).success).toBe(false);
  });
});
