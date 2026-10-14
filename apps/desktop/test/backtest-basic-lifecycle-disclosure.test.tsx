import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BacktestBasicLifecycleFacts } from '../src/features/strategy/BacktestBasicLifecycleFacts.js';

describe('基础日期的实际页面口径', () => {
  it('摘牌日显示原日期，空摘牌日保留未提供，不推导最后交易日', () => {
    const lifecycle = {
      ipoDate: '2019-01-23',
      outDate: null,
      ipoDateStatus: 'known' as const,
      outDateStatus: 'notProvided' as const,
      sourceRecordId: 'basic',
    };
    const empty = renderToStaticMarkup(<BacktestBasicLifecycleFacts lifecycle={lifecycle} />);
    expect(empty).toContain('来源未提供');
    expect(empty).toContain('未提供摘牌日不能证明未来仍上市');
    const known = renderToStaticMarkup(
      <BacktestBasicLifecycleFacts
        lifecycle={{ ...lifecycle, outDate: '2024-10-10', outDateStatus: 'known' }}
      />,
    );
    expect(known).toContain('2024');
    expect(known).toContain('摘牌日不等于最后交易日');
  });
  it('不可用原因显示，无字段的旧快照不追加文案', () => {
    expect(renderToStaticMarkup(<BacktestBasicLifecycleFacts />)).toBe('');
    expect(
      renderToStaticMarkup(
        <BacktestBasicLifecycleFacts
          lifecycle={{
            ipoDate: null,
            outDate: null,
            ipoDateStatus: 'unavailable',
            outDateStatus: 'unavailable',
            reason: '基础日期不可用',
          }}
        />,
      ),
    ).toContain('基础日期不可用');
  });
});
