// @vitest-environment jsdom
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi, flush } from './mobile-view-harness';
import { InstrumentPicker } from '../../src/features/market/InstrumentPicker';
import { InstrumentSymbolField } from '../../src/features/market/InstrumentSymbolField';
const fund = {
  id: '00000000-0000-4000-8000-000000000001',
  canonicalCode: '000001',
  symbol: '000001.OF',
  market: 'OF',
  instrumentType: 'MUTUAL_FUND',
  displayName: '目录基金',
  active: true,
  confirmable: true,
  disabledReason: null,
  generation: 1,
};
function Form() {
  const [value, setValue] = useState('');
  return (
    <>
      <InstrumentSymbolField
        label="基金代码"
        value={value}
        onChange={setValue}
        markets={['OF']}
        instrumentTypes={['MUTUAL_FUND']}
      />
      <output>{value}</output>
    </>
  );
}
it('共用搜索字段保留市场类型限制，选入规范代码且不调用持仓确认', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json([
      fund,
      {
        ...fund,
        id: '00000000-0000-4000-8000-000000000002',
        symbol: '000001.SZ',
        market: 'SZ',
        instrumentType: 'STOCK',
        displayName: '股票',
      },
    ]),
  );
  setApi(fetcher);
  await mount(<Form />);
  await input(field('基金代码'), '基金');
  await click(button('搜索标的'));
  await vi.waitFor(() => expect(button('选择 目录基金')).toBeTruthy());
  expect(button('选择 股票')).toBeUndefined();
  await click(button('选择 目录基金'));
  expect(document.querySelector('output')?.textContent).toBe('000001.OF');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('修改输入立即移除旧结果，晚到结果不能被选择', async () => {
  let finish!: (response: Response) => void;
  setApi(
    vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const confirmed = vi.fn();
  await mount(<InstrumentPicker purpose="browse" onConfirmed={confirmed} />);
  await input(field('代码或名称'), '旧');
  await click(button('搜索标的'));
  await input(field('代码或名称'), '新');
  finish(Response.json([fund]));
  await flush();
  expect(button('选择 目录基金')).toBeUndefined();
  expect(confirmed).not.toHaveBeenCalled();
});

it('目录失败可重试，保留代码输入且不误显示空结果', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ message: '目录暂不可用' }, { status: 503 }))
    .mockResolvedValue(Response.json([fund]));
  setApi(fetcher);
  await mount(<Form />);
  await input(field('基金代码'), '基金');
  await click(button('搜索标的'));
  await vi.waitFor(() => expect(button('重新读取')).toBeTruthy());
  expect(field('基金代码').value).toBe('基金');
  await click(button('重新读取'));
  await vi.waitFor(() => expect(button('选择 目录基金')).toBeTruthy());
});
