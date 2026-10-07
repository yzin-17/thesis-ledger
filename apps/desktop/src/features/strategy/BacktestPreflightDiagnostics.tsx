import type { BacktestPreflightDiagnosticV3 } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const capabilityLabels: Record<string, string> = {
  DAILY_BAR: '日线行情', MINUTE_BAR: '分钟行情', CALENDAR: '交易日历',
  INSTRUMENT_FACTS: '证券事实', CASH_DISTRIBUTION: '现金分红', SPLIT_EVENT: '份额拆并',
};

export function BacktestPreflightDiagnostics({ diagnostics }: {
  diagnostics: readonly BacktestPreflightDiagnosticV3[];
}) {
  return <Alert variant="destructive">
    <AlertTitle>配置暂不可用</AlertTitle>
    <AlertDescription>
      {diagnostics.map((diagnostic, index) => <div key={index} className="flex flex-col gap-1">
        <p>{diagnostic.message}</p>
        {(diagnostic.symbol || diagnostic.capability) && <p>
          {[diagnostic.symbol, diagnostic.capability && (capabilityLabels[diagnostic.capability] ?? diagnostic.capability)].filter(Boolean).join(' · ')}
        </p>}
        {diagnostic.dateRange && <p>检查区间：{diagnostic.dateRange.startDate} 至 {diagnostic.dateRange.endDate}</p>}
        {diagnostic.targetSources.length > 0 && <p>请求来源：{diagnostic.targetSources.map((source) =>
          `${source.providerId} / ${source.upstreamSource}`).join('；')}</p>}
        <p>{diagnostic.suggestedActions.map((action) => action.description).join('；')}</p>
      </div>)}
    </AlertDescription>
  </Alert>;
}
