export type ChartTime = string | number;
export type ChartCandle = {
  time: ChartTime;
  open: number;
  high: number;
  low: number;
  close: number;
};
export type ChartLine = {
  name: string;
  values: { time: ChartTime; value: number }[];
  pane?: number;
  kind?: 'line' | 'histogram';
  style?: 0 | 1 | 2;
};
export type ChartData = { candles: ChartCandle[]; lines: ChartLine[]; main?: 'candles' | 'line' };
export type ChartColors = {
  background: string;
  text: string;
  up: string;
  down: string;
  line: string;
};
export type ChartDiagnostic = 'touch' | 'move' | 'range' | 'cancel' | 'end';
export type ChartMessage = {
  version: 1;
  instanceId: string;
  kind: 'ready' | 'older' | ChartDiagnostic;
};

function orderedChartTimes(points: ReadonlyArray<{ time: ChartTime }>) {
  let previous = -Infinity;
  const timeType = typeof points[0]?.time;
  for (const point of points) {
    if (typeof point.time !== timeType) return false;
    if (typeof point.time === 'number') {
      if (!Number.isSafeInteger(point.time) || point.time < 0 || point.time <= previous)
        return false;
      previous = point.time;
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(point.time)) return false;
    const date = new Date(`${point.time}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== point.time)
      return false;
    const epoch = date.getTime() / 1000;
    if (epoch <= previous) return false;
    previous = epoch;
  }
  return true;
}

export function parseChartMessage(raw: string, instanceId: string): ChartMessage | null {
  if (raw.length > 2048) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    const value = data as Record<string, unknown>;
    if (
      value.version !== 1 ||
      value.instanceId !== instanceId ||
      typeof value.kind !== 'string' ||
      !['ready', 'older', 'touch', 'move', 'range', 'cancel', 'end'].includes(value.kind)
    )
      return null;
    return { version: 1, instanceId, kind: value.kind as ChartMessage['kind'] };
  } catch {
    return null;
  }
}
export function assertChartData(data: ChartData) {
  if (data.candles.length > 3000 || data.lines.length > 10)
    throw new Error('图表数据超过当前窗口上限。');
  if (!orderedChartTimes(data.candles)) throw new Error('图表窗口必须是有序且有效的时间数据。');
  for (const candle of data.candles) {
    if (
      ![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) ||
      candle.high < Math.max(candle.open, candle.close) ||
      candle.low > Math.min(candle.open, candle.close)
    )
      throw new Error('图表窗口必须是有序且有效的日线数据。');
  }
  for (const line of data.lines) {
    if (
      line.values.length > 3000 ||
      (line.pane !== undefined &&
        (!Number.isInteger(line.pane) || line.pane < 0 || line.pane > 3)) ||
      !orderedChartTimes(line.values) ||
      line.values.some((point) => !Number.isFinite(point.value))
    )
      throw new Error('图表指标必须是有序、有效且未超限的日线数据。');
  }
}

function chartPayload(id: string, data: ChartData, colors: ChartColors, diagnostics = false) {
  assertChartData(data);
  return JSON.stringify({ version: 1, id, data, colors, diagnostics }).replace(/</g, '\\u003c');
}

export function chartUpdateScript(
  id: string,
  data: ChartData,
  colors: ChartColors,
  diagnostics = false,
) {
  return `window.__THESIS_LEDGER_CHART_UPDATE__?.(${chartPayload(id, data, colors, diagnostics)});true;`;
}

export function chartDocument(
  library: string,
  id: string,
  data: ChartData,
  colors: ChartColors,
  diagnostics = false,
) {
  const payload = chartPayload(id, data, colors, diagnostics);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:"><style>html,body,#chart{margin:0;height:100%;width:100%;overflow:hidden}</style></head><body><div id="chart"></div><script>${library.replace(/<\/script/gi, '<\\/script')}</script><script>
  (function(){const p=${payload}; const root=document.getElementById('chart');
  const post=kind=>window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({version:1,instanceId:p.id,kind}));
  const palette=colors=>({layout:{background:{color:colors.background},textColor:colors.text},grid:{vertLines:{visible:false},horzLines:{color:colors.text+'18'}}});
  const chart=LightweightCharts.createChart(root,{autoSize:true,...palette(p.colors),timeScale:{timeVisible:false},rightPriceScale:{borderVisible:false},handleScroll:{vertTouchDrag:false,horzTouchDrag:true}});
  const mainLine=p.data.main==='line';
  const candles=chart.addSeries(mainLine?LightweightCharts.LineSeries:LightweightCharts.CandlestickSeries,{borderVisible:false});
  const lines=[];
  const applySeries=()=>{
    chart.applyOptions(palette(p.colors));
    candles.applyOptions(mainLine?{color:p.colors.line,lineWidth:2,priceLineVisible:false}:{upColor:p.colors.up,downColor:p.colors.down,wickUpColor:p.colors.up,wickDownColor:p.colors.down});
    candles.setData(mainLine?p.data.candles.map(point=>({time:point.time,value:point.close})):p.data.candles);
    while(lines.length>p.data.lines.length)chart.removeSeries(lines.pop());
    p.data.lines.forEach((line,index)=>{
      if(!lines[index])lines[index]=chart.addSeries(line.kind==='histogram'?LightweightCharts.HistogramSeries:LightweightCharts.LineSeries,{lineWidth:1,priceLineVisible:false,lastValueVisible:false},line.pane||0);
      lines[index].applyOptions({color:p.colors.line,...(line.kind==='histogram'?{}:{lineStyle:line.style||0})});lines[index].setData(line.kind==='histogram'?line.values.map(point=>({...point,color:point.value>=0?p.colors.up:p.colors.down})):line.values);
    });
  };
  applySeries();
  const timeline=data=>[...new Set([...data.candles.map(point=>point.time),...data.lines.flatMap(line=>line.values.map(point=>point.time))])].sort();
  let interacting=false,writing=false,initialized=false,disposed=false,initialFrame=0;
  window.__THESIS_LEDGER_CHART_UPDATE__=next=>{
    if(next.version!==1||next.id!==p.id||!next.data||!next.colors)return;
    const previous=timeline(p.data),range=initialized?chart.timeScale().getVisibleLogicalRange():null;
    const anchorIndex=range?Math.max(0,Math.min(previous.length-1,Math.floor(range.from))):0;
    const anchor=previous[anchorIndex];
    writing=true;p.data=next.data;p.colors=next.colors;p.diagnostics=next.diagnostics;applySeries();
    const nextIndex=timeline(p.data).indexOf(anchor);
    if(range&&anchor!==undefined&&nextIndex>=0){const shift=nextIndex-anchorIndex;chart.timeScale().setVisibleLogicalRange({from:range.from+shift,to:range.to+shift});}
    else if(initialized)chart.timeScale().fitContent();
    writing=false;
  };
  const begin=()=>{if(!interacting){interacting=true;if(p.diagnostics)post('touch');}};
  const finish=kind=>{if(interacting&&p.diagnostics)post(kind);interacting=false;};
  root.addEventListener('touchstart',begin,{passive:true,capture:true});
  root.addEventListener('pointerdown',begin,{passive:true,capture:true});
  root.addEventListener('touchmove',()=>{if(p.diagnostics)post('move');},{passive:true,capture:true});
  root.addEventListener('pointermove',event=>{if(p.diagnostics&&event.buttons)post('move');},{passive:true,capture:true});
  root.addEventListener('touchcancel',()=>finish('cancel'),{passive:true,capture:true});
  root.addEventListener('pointercancel',()=>finish('cancel'),{passive:true,capture:true});
  root.addEventListener('touchend',()=>finish('end'),{passive:true,capture:true});
  root.addEventListener('pointerup',()=>finish('end'),{passive:true,capture:true});
  chart.timeScale().subscribeVisibleLogicalRangeChange(range=>{if(interacting&&!writing&&range){if(p.diagnostics)post('range');if(range.from<3)post('older');}});
  const viewport=new ResizeObserver(entries=>{
    if(initialized||disposed||initialFrame||!entries.some(entry=>entry.contentRect.width>0&&entry.contentRect.height>0))return;
    initialFrame=requestAnimationFrame(()=>{
      initialFrame=0;if(disposed||root.clientWidth<=0||root.clientHeight<=0)return;
      writing=true;chart.timeScale().fitContent();writing=false;initialized=true;post('ready');
    });
  });
  viewport.observe(root);
  window.addEventListener('pagehide',()=>{disposed=true;viewport.disconnect();if(initialFrame)cancelAnimationFrame(initialFrame);delete window.__THESIS_LEDGER_CHART_UPDATE__;chart.remove();},{once:true});})();
  </script></body></html>`;
}
