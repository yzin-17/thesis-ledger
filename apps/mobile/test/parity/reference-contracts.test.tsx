// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi, flush } from './mobile-view-harness';
import { MarketReferenceContractField } from '../../src/features/market-reference/MarketReferenceContractField';
const page = (file: string) =>
  JSON.parse(
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../packages/api-client/test/fixtures/reference-contracts',
        `${file}.json`,
      ),
      'utf8',
    ),
  );
function Form({ kind }: { kind: 'future' | 'option' }) {
  const [value, setValue] = useState('');
  return (
    <>
      <MarketReferenceContractField kind={kind} value={value} onChange={setValue} />
      <output>{value}</output>
    </>
  );
}
it('从真实来源样本搜索并选入期货代码，读取日期明确且不自动翻页', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(page('futures')));
  setApi(fetcher);
  await mount(<Form kind="future" />);
  expect(fetcher).not.toHaveBeenCalled();
  await click(button('读取合约清单'));
  expect(fetcher).not.toHaveBeenCalled();
  await input(field('合约清单交易日 YYYY-MM-DD'), '2026-11-06');
  await click(button('读取合约清单'));
  await vi.waitFor(() => expect(button('选择 铜 · CU2611')).toBeTruthy());
  await input(field('期货代码'), '铜');
  await click(button('选择 铜 · CU2611'));
  expect(document.querySelector('output')?.textContent).toBe('CU2611');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject({
    dataset: 'futures-daily-shfe',
    start: '2026-11-06',
    end: '2026-11-06',
    pageSize: 20,
  });
});
it('期权仅从支持的 ETF 近月清单选择原始八位代码，不确认持仓', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(page('options')));
  setApi(fetcher);
  await mount(<Form kind="option" />);
  await input(field('期权标的 ETF'), '159915.SZ');
  await click(button('读取合约清单'));
  expect(fetcher).not.toHaveBeenCalled();
  await input(field('期权标的 ETF'), '510050.SH');
  await click(button('读取合约清单'));
  await vi.waitFor(() => expect(button('选择 10012637')).toBeTruthy());
  await input(field('期权合约代码'), '10012637');
  await click(button('选择 10012637'));
  expect(document.querySelector('output')?.textContent).toBe('10012637');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('改变来源条件立即移除旧候选；失败保持原始手工代码', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(page('futures')))
    .mockResolvedValue(Response.json({ message: '来源暂不可用' }, { status: 503 }));
  setApi(fetcher);
  await mount(<Form kind="future" />);
  await input(field('合约清单交易日 YYYY-MM-DD'), '2026-11-06');
  await click(button('读取合约清单'));
  await vi.waitFor(() => expect(button('选择 铜 · CU2611')).toBeTruthy());
  await input(field('合约清单交易日 YYYY-MM-DD'), '2026-11-05');
  expect(button('选择 铜 · CU2611')).toBeUndefined();
  await input(field('期货代码'), 'RB0');
  await click(button('读取合约清单'));
  await flush();
  expect(document.querySelector('output')?.textContent).toBe('RB0');
  expect(button('选择 铜 · CU2611')).toBeUndefined();
});
