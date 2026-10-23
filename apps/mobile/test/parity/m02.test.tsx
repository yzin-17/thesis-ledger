// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi, view } from './mobile-view-harness';
import { BaselineScreen } from '../../src/features/account-baselines/BaselineScreen';
import {
  emptyLedger,
  instrument,
  ledgerAccount,
  ledgerAccountId as accountId,
  ledgerWriteResult,
} from './ledger-fixture';

describe('人工基线身份、来源时间和失败恢复', () => {
  it('明确确认目录身份，空时间不可写，重试保留命令身份与十进制原值', async () => {
    const writes: Array<Record<string, unknown>> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/accounts')) return Response.json([ledgerAccount]);
      if (path.endsWith('/events')) return Response.json(emptyLedger);
      if (path.endsWith('/valuation')) return Response.json({ invalid: true });
      if (path.endsWith('/instruments/search')) return Response.json([instrument]);
      if (path.endsWith('/confirm')) return new Response(null, { status: 204 });
      const command = JSON.parse(String(init?.body));
      writes.push(command);
      if (writes.length === 1)
        return Response.json({ error: 'TEMPORARY', message: '写入暂不可用' }, { status: 503 });
      return Response.json(ledgerWriteResult);
    });
    view.params = { accountId };
    setApi(fetcher);
    await mount(<BaselineScreen />);
    expect(button('写入持仓快照').disabled).toBe(true);
    await input(field('代码或名称'), '510300');
    await click(button('搜索标的'));
    expect(button('写入持仓快照').disabled).toBe(true);
    await click(button('确认 受控 ETF'));
    await input(field('数量'), '100.00000001');
    await input(field('成本均价（CNY，未知留空）'), '3.12345678');
    await click(button('写入持仓快照'));
    expect(writes).toHaveLength(0);
    await input(field('实际观察日期或 ISO 时间'), '2026-10-21');
    await click(button('写入持仓快照'));
    expect(field('数量').value).toBe('100.00000001');
    await click(button('写入持仓快照'));
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
    expect(writes[0]).toMatchObject({
      scope: 'PARTIAL',
      observedAt: '2026-10-21',
      timePrecision: 'DATE',
      observations: [{ symbol: '510300.SH', quantity: '100.00000001', averageCost: '3.12345678' }],
    });
    expect(document.body.textContent).toContain('持仓已写入账本');
  });
});
