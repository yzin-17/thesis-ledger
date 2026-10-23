import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { useIsFocused } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { Copy } from '../../components/MobilePrimitives';
import {
  chartDocument,
  chartUpdateScript,
  type ChartData,
  type ChartDiagnostic,
  assertChartData,
} from './chart-document';
import { createChartBridge } from './chart-bridge';
import { chartViewportHeight } from './chart-layout';
declare function __MOBILE_CHART_LIBRARY__(): string;

type MobileChartProps = {
  data: ChartData;
  onOlder?: () => void;
  onReady?: () => void;
  onDiagnostic?: (kind: ChartDiagnostic) => void;
};

export function MobileChart(props: MobileChartProps) {
  const focused = useIsFocused();
  const { height } = useWindowDimensions();
  const panes = Math.max(0, ...props.data.lines.map((line) => line.pane ?? 0));
  const chartHeight = chartViewportHeight(height, panes);
  const invalid = useMemo(() => {
    try {
      assertChartData(props.data);
      return false;
    } catch {
      return true;
    }
  }, [props.data]);
  if (invalid) return <Copy muted>图表时间或数据不完整，请重新读取。</Copy>;
  if (!focused) return <View style={{ height: chartHeight }} />;
  return <ChartInstance {...props} height={chartHeight} />;
}

function ChartInstance({
  data,
  onOlder,
  onReady,
  onDiagnostic,
  height,
}: MobileChartProps & { height: number }) {
  const { theme } = useMobileRuntime();
  const [instance] = useState(() => Crypto.randomUUID());
  const callbacks = useRef({ onOlder, onReady, onDiagnostic });
  callbacks.current = { onOlder, onReady, onDiagnostic };
  const diagnostics = Boolean(onDiagnostic);
  const colors = useMemo(
    () => ({
      background: theme.surface1,
      text: theme.textSecondary,
      up: theme.marketUp,
      down: theme.marketDown,
      line: theme.brand,
    }),
    [theme.surface1, theme.textSecondary, theme.marketUp, theme.marketDown, theme.brand],
  );
  const [source] = useState(() => ({
    html: chartDocument(__MOBILE_CHART_LIBRARY__(), instance, data, colors, diagnostics),
    baseUrl: 'about:blank',
  }));
  const script = useMemo(
    () => chartUpdateScript(instance, data, colors, diagnostics),
    [instance, data, colors, diagnostics],
  );
  const latestScript = useRef(script);
  latestScript.current = script;
  const webview = useRef<WebView>(null);
  const ready = useRef(false);
  const bridge = useMemo(
    () =>
      createChartBridge(instance, {
        onOlder: () => callbacks.current.onOlder?.(),
        onReady: () => {
          ready.current = true;
          webview.current?.injectJavaScript(latestScript.current);
          callbacks.current.onReady?.();
        },
        onDiagnostic: (kind) => callbacks.current.onDiagnostic?.(kind),
      }),
    [instance],
  );
  useEffect(() => {
    bridge.start();
    return () => {
      ready.current = false;
      bridge.dispose();
    };
  }, [bridge]);
  useEffect(() => {
    if (ready.current) webview.current?.injectJavaScript(script);
  }, [script]);
  if (Platform.OS === 'web') return <Copy muted>图表请在 Android 或 iOS 中查看。</Copy>;
  return (
    <View style={{ height }}>
      <WebView
        ref={webview}
        originWhitelist={['about:blank']}
        source={source}
        javaScriptEnabled
        domStorageEnabled={false}
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        mixedContentMode="never"
        onShouldStartLoadWithRequest={(request) => request.url === 'about:blank'}
        onMessage={(event) => {
          bridge.receive(event.nativeEvent.data);
        }}
      />
    </View>
  );
}
