import { useEffect, useRef, useState } from 'react';
import { chartDocument, parseChartMessage, type ChartData } from '../src/platform/charts/chart-document';
declare function __MOBILE_CHART_LIBRARY__(): string;
export function MobileChart({ data, onPointTime }: { data: ChartData; onPointTime?: (time: number) => void }) {
  const [id] = useState(() => crypto.randomUUID()), frame = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef(onPointTime); callbacks.current = onPointTime;
  const colors = { background: '#ffffff', text: '#64748b', up: '#c7393c', down: '#2f7a66', line: '#2563eb' };
  const [source] = useState(() => chartDocument(__MOBILE_CHART_LIBRARY__(), id, data, colors).replace('<script>', '<script>window.ReactNativeWebView={postMessage:message=>parent.postMessage(message,"*")};</script><script>'));
  useEffect(() => {
    const receive = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return;
      const point = parseChartMessage(e.data, id);
      if (point?.kind === 'point' && point.time !== undefined) callbacks.current?.(point.time);
    };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, [id]);
  useEffect(() => {
    const target = frame.current?.contentWindow as (Window & { __THESIS_LEDGER_CHART_UPDATE__?: (input: unknown) => void }) | null;
    target?.__THESIS_LEDGER_CHART_UPDATE__?.({ version: 1, id, data, colors, diagnostics: false });
  }, [data]);
  return <iframe title="移动收益图表" ref={frame} srcDoc={source} style={{ width: '100%', height: 300, border: 0 }} />;
}
