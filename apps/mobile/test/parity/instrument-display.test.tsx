// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { button, click, mount, view } from './mobile-view-harness';
import { ExecutionsScreen } from '../../src/features/executions/ExecutionsScreen';
import { AuditScreen } from '../../src/features/executions/AuditScreen';
import { JournalScreen } from '../../src/features/journal-trade/JournalScreen';
import { ledgerAccount, ledgerAccountId } from './ledger-fixture';

const directory = (symbol: string, displayName: string) => ({
  generation: 4,
  items: [{ symbol, displayName }],
  unresolvedSymbols: [],
});
const event = {
  eventId: 'event',
  factId: 'fact',
  type: 'BUY_EXECUTION',
  revisionAction: 'CREATE',
  ledgerRevision: '7',
  occurredAt: '2026-11-04T00:00:00Z',
  sourceTimezone: 'UTC',
  recordedAt: '2026-11-04T00:00:00Z',
  source: { channel: 'manual' },
  actorId: 'user',
  payload: { symbol: '000001.OF', quantity: '90', price: '1.22', currency: 'CNY', charges: [] },
};

describe('移动端主响应目录名称', () => {
  it.each([ExecutionsScreen, AuditScreen])(
    '成交与审计消费服务端目录，不增加目录查询',
    async (Screen) => {
      view.params = { accountId: ledgerAccountId };
      const read = vi.fn(async () => ({
        events: [event],
        ledgerRevision: '7',
        instrumentDirectory: directory('000001.OF', '华夏成长混合'),
      }));
      const search = vi.fn();
      view.runtime.api = {
        accounts: { list: vi.fn(async () => [ledgerAccount]) },
        ledger: { getEvents: read, getEventAudit: read },
        instruments: { search },
      };
      await mount(<Screen />);
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain('华夏成长混合 · 000001.OF'),
      );
      expect(read).toHaveBeenCalledTimes(1);
      expect(search).not.toHaveBeenCalled();
      expect(event.payload).toMatchObject({ symbol: '000001.OF', quantity: '90', price: '1.22' });
    },
  );

  it('分页各用自己的目录，追加空目录页不丢前页名称，未知项只显示代码', async () => {
    view.params = {};
    const row = (symbol: string) => ({
      input: {
        trade: { symbol },
        reference: {
          reviewObjectId: symbol,
          reviewObjectType: 'TRADE_CYCLE',
        },
      },
      openedAt: null,
      reviewStatus: 'CURRENT',
    });
    const candidates = vi
      .fn()
      .mockResolvedValueOnce({
        items: [row('000001.OF')],
        instrumentDirectory: directory('000001.OF', '华夏成长混合'),
        legacyItems: [],
        nextCursor: 'next',
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [row('999999.OF')],
        instrumentDirectory: { generation: 4, items: [], unresolvedSymbols: ['999999.OF'] },
        legacyItems: [],
        nextCursor: null,
        total: 2,
      });
    view.runtime.api = {
      accounts: { list: vi.fn(async () => [ledgerAccount]) },
      journalReviews: { candidates },
    };
    await mount(<JournalScreen />);
    await vi.waitFor(() => expect(document.body.textContent).toContain('华夏成长混合'));
    await click(button('更多复盘对象'));
    expect(document.body.textContent).toContain('华夏成长混合 · 000001.OF');
    expect(document.body.textContent).toContain('999999.OF');
    expect(document.body.textContent).not.toContain('999999.OF · 999999.OF');
    expect(candidates).toHaveBeenCalledTimes(2);
  });
});
