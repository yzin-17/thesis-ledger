import { describe, it, expect, vi } from 'vitest';
import { chartDocument, parseChartMessage } from '../../src/platform/charts/chart-document';
import { createChartBridge } from '../../src/platform/charts/chart-bridge';
describe('本地图表桥', () => {
  it('仅处理当前实例并限制翻页频率，离页后不执行遗留回调', () => {
    vi.useFakeTimers();
    try {
      const onOlder = vi.fn(),
        onReady = vi.fn(),
        onDiagnostic = vi.fn();
      const bridge = createChartBridge('current', { onOlder, onReady, onDiagnostic });
      const message = (instanceId: string, kind: string) =>
        JSON.stringify({ version: 1, instanceId, kind });
      bridge.receive(message('old', 'older'));
      bridge.receive(message('current', 'ready'));
      bridge.receive(message('current', 'older'));
      bridge.receive(message('current', 'older'));
      expect(onOlder).toHaveBeenCalledOnce();
      expect(onReady).toHaveBeenCalledOnce();
      bridge.receive(message('old', 'touch'));
      bridge.receive(message('current', 'touch'));
      bridge.receive(message('current', 'move'));
      bridge.receive(message('current', 'move'));
      bridge.receive(message('current', 'range'));
      expect(onDiagnostic.mock.calls.map(([kind]) => kind)).toEqual(['touch', 'move', 'range']);
      vi.advanceTimersByTime(801);
      expect(onOlder).toHaveBeenCalledOnce();
      bridge.receive(message('current', 'older'));
      expect(onOlder).toHaveBeenCalledTimes(2);
      bridge.dispose();
      vi.advanceTimersByTime(801);
      bridge.receive(message('current', 'touch'));
      bridge.receive(message('current', 'range'));
      expect(onDiagnostic).toHaveBeenCalledTimes(3);
      bridge.receive(message('current', 'older'));
      expect(onOlder).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('拒绝无效日期、错误高低价和无效指标窗口', () => {
    const candle = { time: '2026-01-01', open: 1, high: 2, low: 0, close: 1 };
    const colors = { background: '#fff', text: '#000', up: '#f00', down: '#080', line: '#00f' };
    expect(() =>
      chartDocument('', 'a', { candles: [{ ...candle, time: '2026-02-30' }], lines: [] }, colors),
    ).toThrow();
    expect(() =>
      chartDocument('', 'a', { candles: [{ ...candle, high: 0 }], lines: [] }, colors),
    ).toThrow();
    expect(() =>
      chartDocument(
        '',
        'a',
        {
          candles: [candle],
          lines: [{ name: '指标', values: [{ time: candle.time, value: NaN }] }],
        },
        colors,
      ),
    ).toThrow();
  });
  it('忽略旧实例、未知命令与无效消息', () => {
    expect(parseChartMessage('{', 'a')).toBeNull();
    expect(
      parseChartMessage(JSON.stringify({ version: 1, instanceId: 'a', kind: ['older'] }), 'a'),
    ).toBeNull();
    expect(
      parseChartMessage(JSON.stringify({ version: 1, instanceId: 'old', kind: 'ready' }), 'a'),
    ).toBeNull();
    expect(
      parseChartMessage(JSON.stringify({ version: 1, instanceId: 'a', kind: 'fetch' }), 'a'),
    ).toBeNull();
    expect(
      parseChartMessage(JSON.stringify({ version: 1, instanceId: 'a', kind: 'older' }), 'a')?.kind,
    ).toBe('older');
  });
  it('拒绝逆序/超限窗口，并隔离脚本结束标签和网络访问', () => {
    const colors = {
      background: '#ffffff',
      text: '#000000',
      up: '#c00000',
      down: '#008000',
      line: '#0000ff',
    };
    const candle = { time: '2026-01-01', open: 1, high: 2, low: 0, close: 1 };
    expect(() =>
      chartDocument('', 'a', { candles: [candle, candle], lines: [] }, colors),
    ).toThrow();
    const html = chartDocument(
      '/* </script> */',
      'a</script>',
      { candles: [candle], lines: [] },
      colors,
    );
    expect(html).not.toContain('a</script>');
    expect(html).toContain("default-src 'none'");
  });
});
