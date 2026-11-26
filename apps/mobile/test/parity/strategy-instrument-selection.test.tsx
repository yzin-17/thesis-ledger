// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi } from './mobile-view-harness';
import { StrategyEditorScreen } from '../../src/features/strategy-editor/StrategyEditorScreen';
import { b4Strategy } from './batch4-fixture';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn().mockResolvedValue(undefined), removeItem: vi.fn().mockResolvedValue(undefined) } }));
const rows = [
  ['510300.SH', 'SH', 'ETF'], ['02800.HK', 'HK', 'ETF'], ['AAPL.US', 'US', 'STOCK'], ['000001.OF', 'OF', 'MUTUAL_FUND'],
].map(([symbol, market, instrumentType], index) => ({ id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`, symbol, market, instrumentType, canonicalCode: symbol!.split('.')[0], displayName: `目录${symbol}`, active: true, confirmable: true, disabledReason: null, generation: 1 }));
const writes: Array<Record<string, unknown>> = [];
beforeEach(() => {
  writes.length = 0;
  setApi(vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      writes.push(body);
      return Response.json({ ...b4Strategy, name: body.name, versions: [{ ...b4Strategy.versions[0], schema: body.schema }] });
    }
    if (String(url).includes('/instruments/search')) return Response.json(rows);
    return Response.json([]);
  }));
});

it.each([
  ['510300.SH', 'CN', 'etf'], ['02800.HK', 'HK', 'etf'], ['AAPL.US', 'US', 'stock'],
])('移动端选择 %s 后显式复制来源，保存参数一致', async (symbol, market, assetType) => {
  await mount(<StrategyEditorScreen />);
  await input(field('执行标的'), '目录'); await click(button('搜索标的'));
  expect(button('选择 目录000001.OF')).toBeUndefined();
  await click(button(`选择 目录${symbol}`));
  expect(field('执行标的').value).toBe(`目录${symbol} · ${symbol}`);
  await click(button('使用执行标的'));
  await click(button('高级 JSON'));
  await click(button('常用配置'));
  expect(field('执行标的').value).toBe(`目录${symbol} · ${symbol}`);
  await click(button('确认创建策略'));
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ schema: { executionInstrument: { symbol, market, assetType }, signalSources: [{ id: 'execution', asset: { symbol, market, assetType } }] } });
});

it('搜索新标的而未选择结果时不能沿用上一身份保存', async () => {
  await mount(<StrategyEditorScreen />);
  await input(field('执行标的'), '目录'); await click(button('搜索标的'));
  await click(button('选择 目录02800.HK'));
  await input(field('执行标的'), '未选择的文本');
  await click(button('确认创建策略'));
  expect(writes).toEqual([]);
  expect(field('执行标的').value).toBe('未选择的文本');
});
