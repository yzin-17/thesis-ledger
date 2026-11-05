// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileChart } from '../../src/platform/charts/MobileChart';
import type { ChartData } from '../../src/platform/charts/chart-document';

type NativeChartProps = {
  source: { html: string };
  onMessage: (event: { nativeEvent: { data: string } }) => void;
};
const native = vi.hoisted(() => ({
  focused: true,
  serial: 0,
  viewport: { width: 390, height: 844, scale: 3, fontScale: 1 },
  instances: [] as NativeChartProps[],
  unmount: vi.fn(),
  inject: vi.fn(),
}));
vi.mock('@react-navigation/native', () => ({ useIsFocused: () => native.focused }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `chart-${++native.serial}` }));
vi.mock('../../src/app/MobileRuntime', () => ({
  useMobileRuntime: () => ({
    theme: {
      surface1: '#fff',
      textSecondary: '#000',
      marketUp: '#080',
      marketDown: '#f00',
      brand: '#00f',
    },
  }),
}));
vi.mock('react-native', async () => {
  const React = await import('react');
  return {
    Platform: { OS: 'ios' },
    useWindowDimensions: () => native.viewport,
    View: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', {}, children),
  };
});
vi.mock('../../src/components/MobilePrimitives', () => ({ Copy: () => null }));
vi.mock('react-native-webview', async () => {
  const React = await import('react');
  return {
    WebView: React.forwardRef<{ injectJavaScript: (script: string) => void }, NativeChartProps>(
      (props, ref) => {
        native.instances.push(props);
        React.useImperativeHandle(ref, () => ({ injectJavaScript: native.inject }));
        React.useEffect(() => () => native.unmount(), []);
        return React.createElement('div', { 'data-native-chart': true });
      },
    ),
  };
});
beforeEach(() => {
  native.focused = true;
  native.serial = 0;
  native.viewport = { width: 390, height: 844, scale: 3, fontScale: 1 };
  native.instances = [];
  native.unmount.mockClear();
  native.inject.mockClear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('__MOBILE_CHART_LIBRARY__', () => '/* bundled library */');
});
afterEach(() => vi.unstubAllGlobals());

describe('图表原生视图的导航生命周期', () => {
  it('旋转保留图表实例；失焦卸载，重新进入拒绝旧消息', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const onOlder = vi.fn();
    let data: ChartData = { candles: [], lines: [] };
    const render = () => root.render(<MobileChart data={data} onOlder={onOlder} />);
    const send = (props: NativeChartProps, instanceId: string) =>
      props.onMessage({
        nativeEvent: { data: JSON.stringify({ version: 1, instanceId, kind: 'older' }) },
      });
    try {
      await act(render);
      const first = native.instances.at(-1)!;
      expect(host.querySelector('[data-native-chart]')).not.toBeNull();
      first.onMessage({
        nativeEvent: { data: JSON.stringify({ version: 1, instanceId: 'chart-1', kind: 'ready' }) },
      });
      expect(native.inject).toHaveBeenCalledOnce();
      native.viewport = { width: 844, height: 390, scale: 3, fontScale: 1 };
      await act(render);
      expect(native.instances.at(-1)!.source.html).toContain('"id":"chart-1"');
      expect(native.instances.at(-1)!.source).toBe(first.source);
      expect(native.unmount).not.toHaveBeenCalled();
      data = {
        candles: [{ time: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }],
        lines: [],
      };
      await act(render);
      expect(native.instances.at(-1)!.source).toBe(first.source);
      expect(native.inject).toHaveBeenCalledTimes(2);
      native.focused = false;
      await act(render);
      expect(host.querySelector('[data-native-chart]')).toBeNull();
      expect(native.unmount).toHaveBeenCalledOnce();
      send(first, 'chart-1');
      expect(onOlder).not.toHaveBeenCalled();
      native.focused = true;
      await act(render);
      const second = native.instances.at(-1)!;
      expect(second.source.html).toContain('"id":"chart-2"');
      send(second, 'chart-1');
      expect(onOlder).not.toHaveBeenCalled();
      send(second, 'chart-2');
      expect(onOlder).toHaveBeenCalledOnce();
    } finally {
      await act(() => root.unmount());
    }
  });
});
