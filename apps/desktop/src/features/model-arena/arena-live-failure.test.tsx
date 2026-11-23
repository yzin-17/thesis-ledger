// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { ArenaLiveDetail } from '@thesis-ledger/schemas';
import { formatDateTimeWithLocalZone } from '@/lib/date-display';
import { ArenaLiveDecisions } from './ArenaLiveDecisions.js';
import { arenaResearchFailureDetail } from './arena-live-failure.js';

const invalidGroupAudit = { calls: [{
  error: { code: 'schema_invalid', externalResult: 'complete' },
  diagnostics: { contractCheck: { issues: [{ code: 'custom', path: ['decision', 'orders', 0, 'exitGroup'] }] },
    outputText: 'PRIVATE_CONTENT_MUST_NOT_APPEAR',
  },
}] };

describe('自主竞技场模型输出失败诊断', () => {
  it('展示具体订单字段，避免把模型原始输出直接展现在失败摘要', () => {
    const detail = arenaResearchFailureDetail('model_output_invalid', invalidGroupAudit);
    expect(detail).toContain('第 1 笔委托');
    expect(detail).toContain('exitGroup');
    expect(detail).toContain('买入单不能与止损单');
    expect(detail).not.toContain('PRIVATE_CONTENT_MUST_NOT_APPEAR');
  });
  it('到期日期错误、截断、未知结构和其它失败均能安全降级', () => {
    expect(arenaResearchFailureDetail('model_output_invalid', { calls: [{
      error: { code: 'schema_invalid' },
      diagnostics: { contractCheck: { issues: [{ path: ['decision', 'orders', 0, 'onFill', 'activateOrders', 0, 'validUntil', 'expiresOn'] }] } },
    }] })).toContain('onFill.activateOrders.0.validUntil.expiresOn');
    expect(arenaResearchFailureDetail('model_output_invalid', { calls: [{
      error: { code: 'schema_invalid' },
      diagnostics: { contractCheck: { issues: [{ path: ['decision', 'orders', 1, 'expiresOn'] }] } },
    }] })).toContain('第 2 笔委托的 expiresOn');
    expect(arenaResearchFailureDetail('model_output_invalid', { calls: [{ error: { code: 'output_truncated' } }] })).toContain('输出被截断');
    expect(arenaResearchFailureDetail('model_output_invalid', { calls: [] })).toContain('未通过研究指令校验');
    expect(arenaResearchFailureDetail('model_output_invalid', null)).toContain('未通过交易指令校验');
    expect(arenaResearchFailureDetail('research_failed', invalidGroupAudit)).toBeNull();
  });
  it('历史决策中的失败原因、时间和时区均可直接阅读', () => {
    const at = '2026-11-13T14:35:19.602Z';
    const detail = {
      protocol: { timeZone: 'America/New_York' },
      instrumentDirectory: {},
      agents: [{ id: 'agent-a', cycles: [{ id: 'cycle-a', asOf: at, createdAt: at,
        state: 'failed', reason: 'model_output_invalid', decision: null, usage: invalidGroupAudit, requestId: null }] }],
    } as unknown as ArenaLiveDetail;
    const html = renderToStaticMarkup(
      <MemoryRouter><ArenaLiveDecisions detail={detail} agentId="agent-a" /></MemoryRouter>,
    );
    expect(html).toContain(formatDateTimeWithLocalZone(at));
    expect(html).toContain('exitGroup');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('PRIVATE_CONTENT_MUST_NOT_APPEAR');
  });
});
