// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { field, mount, setApi } from './mobile-view-harness';
import { StrategyExecutionInstrumentField } from '../../src/features/strategy-editor/StrategyExecutionInstrumentField';
import { strategyInstrumentLabel } from '../../src/features/strategy-library/strategy-instrument-display';

it('已保存策略的名称回显与聚焦不修改定义，也不发起补名请求', async () => {
  const fetcher = vi.fn(); setApi(fetcher);
  const onChange = vi.fn();
  const instrumentDirectory = { generation: 1, unresolvedSymbols: [], items: [{
    symbol: '600519.SH', canonicalCode: '600519', market: 'SH', instrumentType: 'STOCK',
    displayName: '贵州茅台', active: true,
  }] };
  const definition = { executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' } };
  await mount(<StrategyExecutionInstrumentField definition={definition} instrumentDirectory={instrumentDirectory} locked={false} onChange={onChange} />);
  expect(field('执行标的').value).toBe('贵州茅台 · 600519.SH');
  await act(async () => { field('执行标的').focus(); await Promise.resolve(); });
  expect(field('执行标的').value).toBe('600519.SH');
  await act(async () => { field('执行标的').blur(); await Promise.resolve(); });
  expect(field('执行标的').value).toBe('贵州茅台 · 600519.SH');
  expect(onChange).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(strategyInstrumentLabel({ id: 'v1', version: 1, schema: definition, instrumentDirectory }))
    .toBe('贵州茅台 · 600519.SH');
  expect(strategyInstrumentLabel({ id: 'v1', version: 1, schema: definition })).toBe('600519.SH');
});
