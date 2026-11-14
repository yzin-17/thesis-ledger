// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { InstrumentDirectory } from '@thesis-ledger/schemas';
import { StrategyConfigurationFields } from './StrategyConfigurationFields.js';
import { StrategyV2Summary } from './StrategyV2Summary.js';
import { createDefaultStrategySchema } from './strategy.schema.js';
import { strategyVersionSummary } from './strategy-version-summary.model.js';
import { strategyInstrumentLabel, strategyVersionInstruments } from './strategy-instrument-display.js';

const directory: InstrumentDirectory = { generation: 1, unresolvedSymbols: [], items: [{
  symbol: '600519.SH', canonicalCode: '600519', market: 'SH', instrumentType: 'STOCK',
  displayName: '贵州茅台', active: true,
}] };
const schema = { ...createDefaultStrategySchema(),
  executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
  signalSources: [{ id: 'execution', priceCoordinate: 'research', asset: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
    timeframe: '1d', series: ['open', 'close'] }],
};
const version = { id: 'v1', version: 1, schema, instrumentDirectory: directory };
const interact = (action: () => void) => act(async () => { action(); await Promise.resolve(); });

describe('策略标的名称展示', () => {
  it('首次打开与重新挂载均回显名称，聚焦失焦不修改代码', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const onChange = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(Response.json([]));
    vi.stubGlobal('fetch', fetcher);
    const frozen = structuredClone(schema);
    const host = document.createElement('div'); document.body.append(host);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const root = createRoot(host);
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        await interact(() => root.render(<QueryClientProvider client={client}>
          <StrategyConfigurationFields schema={schema} instrumentDirectory={directory} onChange={onChange} />
        </QueryClientProvider>));
        const input = host.querySelector<HTMLInputElement>('#strategy-v2-symbol')!;
        expect(input.value).toBe('贵州茅台 · 600519.SH');
        expect(host.querySelector('label[for="strategy-v2-symbol"]')?.textContent).toBe('执行标的');
        expect(host.textContent).toContain('贵州茅台 · 600519.SH / 日线');
        expect(fetcher).not.toHaveBeenCalled();
        await interact(() => input.focus());
        await interact(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        await interact(() => input.blur());
        expect(input.value).toBe('贵州茅台 · 600519.SH');
        expect(onChange).not.toHaveBeenCalled();
        await interact(() => root.unmount()); client.clear();
      }
      expect(schema).toEqual(frozen);
    } finally { host.remove(); vi.unstubAllGlobals(); }
  });

  it('列表和定义的执行标的与信号条件统一显示名称，未知目录回退完整代码', () => {
    expect(strategyVersionInstruments(version)).toEqual(['贵州茅台 · 600519.SH']);
    expect(renderToStaticMarkup(<StrategyV2Summary schema={schema} instrumentDirectory={directory} />)).toContain('贵州茅台 · 600519.SH');
    expect(strategyInstrumentLabel(directory, '600519.HK')).toBe('600519.HK');
    expect(strategyInstrumentLabel(undefined, '600519.SH')).toBe('600519.SH');
    const summary = strategyVersionSummary(version);
    expect(summary.kind).toBe('ready');
    if (summary.kind === 'ready') {
      expect(summary.sections.find((field) => field.label === '适用范围')?.value).toContain('贵州茅台');
      expect(summary.sections.find((field) => field.label === '入场逻辑')?.value).toContain('贵州茅台');
    }
    expect(renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>
      <StrategyConfigurationFields schema={schema} onChange={vi.fn()} />
    </QueryClientProvider>)).toContain('value="600519.SH"');
  });
});
