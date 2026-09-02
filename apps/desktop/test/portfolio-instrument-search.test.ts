import { describe, expect, it } from 'vitest';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';

import { instrumentSearchErrorFeedback } from '../src/features/portfolio/portfolio.instrument-search.js';

describe('Portfolio 标的搜索错误反馈', () => {
  it('将目录未就绪解释为服务端准备中，而不是要求用户手动同步', () => {
    const feedback = instrumentSearchErrorFeedback(
      new ThesisLedgerApiError(503, {
        error: 'catalog_not_ready',
        errorCode: 'catalog_not_ready',
        message: '标的目录正在准备或暂不可用，请稍后重试',
      }),
    );

    expect(feedback).toEqual({
      title: '标的目录准备中',
      description: '服务器正在准备标的目录，请稍后重试。',
    });
    expect(feedback.description).not.toContain('同步');
  });

  it('保留普通 DSA、网络或其他 HTTP 搜索失败的通用重试提示', () => {
    const expected = {
      title: '标的搜索失败',
      description: '搜索暂时不可用，请稍后重试。',
    };

    expect(
      instrumentSearchErrorFeedback(new ThesisLedgerApiError(503, { error: 'unavailable' })),
    ).toEqual(expected);
    expect(instrumentSearchErrorFeedback(new Error('network down'))).toEqual(expected);
  });
});
