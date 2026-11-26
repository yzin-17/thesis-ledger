import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { marketDisplayDetailResponseSchema, type QuoteStaleReason } from '@thesis-ledger/schemas';
import { Dialog, DialogContent, DialogTitle } from '../src/components/ui/dialog.js';
import { MarketDetailNotice, QuoteSection } from '../src/features/market-detail/MarketDetailSections.js';
import { marketDetailNotices } from '../src/features/market-detail/market-detail-notices.js';
import '../src/ui/styles.css';

const reasons: Record<string, QuoteStaleReason | undefined> = {
  aged: { code: 'market_time_aged', message: '当前为交易时段，来源行情时间距当前已超过 10 分钟。' },
  older: { code: 'market_time_aged', message: '报价未覆盖最近已结束的交易时段（2026-11-06），当前保留上次可用数据。' },
  timeout: { code: 'timeout', message: '数据源请求超时，当前展示上次成功取得的数据。' },
  limited: { code: 'rate_limited', message: '数据源限制了请求频率，当前展示上次成功取得的数据。', httpStatus: 429 },
  cooldown: { code: 'request_budget_cooldown', message: '行情请求仍在 10 分钟冷却窗口内，本次未再次请求来源，当前展示上次可用数据。' },
  closedFailure: { code: 'timeout', message: '数据源请求超时，当前展示上次成功取得的数据。' },
};
const labels = { closed: '正常休市快照', older: '缺少最近时段', closedFailure: '休市刷新失败', aged: '行情时点超限', timeout: '刷新超时', limited: '来源限流', cooldown: '请求冷却', legacy: '旧响应', ready: '新鲜备用来源' };
function Fixture() {
  const [scenario, setScenario] = useState('closed');
  const stale = scenario !== 'ready' && scenario !== 'closed';
  let freshness = stale ? 'stale' : 'live';
  if (scenario === 'closed') freshness = 'delayed';
  const closed = scenario === 'closed' || scenario === 'closedFailure';
  const detail = marketDisplayDetailResponseSchema.parse({
    contractVersion: 1, symbol: '510300.SH', assetType: 'ETF', requestId: 'controlled', generatedAt: '2026-11-09T02:00:00Z',
    identity: { source: 'asset', status: 'confirmed' }, requested: ['quote'], dependencies: {},
    capabilities: { supported: ['quote'], unsupported: [] }, limits: { bars: 90, nav: 90 },
    sections: { quote: { capability: 'quote', status: stale ? 'stale' : 'ready', data: {
      version: 3, symbol: '510300.SH', price: 4.124, open: 4.113, high: 4.169, low: 4.095,
      previousClose: 4.195, volume: null, amount: null, provider: 'tencent',
      stale, freshness, fallbackUsed: scenario === 'ready',
      marketTime: scenario === 'ready' ? '2026-11-09T02:00:00Z' : '2026-11-06T07:00:00Z',
      fetchedAt: '2026-11-09T02:00:00Z', staleReason: reasons[scenario],
      sessionContext: closed ? { session: 'closed_snapshot', latestTradingDate: '2026-11-06', evaluatedAt: '2026-11-08T17:45:00Z', calendarRevision: 'verified' } : undefined,
      units: { priceCurrency: 'CNY', volume: 'unknown', turnoverCurrency: 'unknown' },
    } } },
  });
  const onRetry = () => setScenario('ready');
  const notices = marketDetailNotices(detail, false, onRetry);
  return <Dialog open><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
    <DialogTitle>行情原因验证</DialogTitle>
    <select aria-label="诊断样本" className="rounded-md border p-2 text-sm" value={scenario} onChange={(event) => setScenario(event.target.value)}>
      {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    {notices.stale && !notices.quoteInfoNotice ? <MarketDetailNotice {...notices.staleNotice} onRetry={onRetry} /> : null}
    <QuoteSection section={detail.sections.quote!} notice={notices.quoteInfoNotice} onRetry={onRetry} retrying={false} />
  </DialogContent></Dialog>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
