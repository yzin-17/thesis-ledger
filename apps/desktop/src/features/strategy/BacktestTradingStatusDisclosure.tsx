import { backtestTradingStatusDisclosureV3Schema } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatDateOnly, formatDateTime } from '@/lib/date-display';
import { tradingStatusPeriods } from './backtest-trading-status-disclosure.model.js';
import { BacktestStatusDimensions } from './BacktestStatusDimensions.js';
import { BacktestStructuredStatusFacts } from './BacktestStructuredStatusFacts.js';

const stateLabel = {
  suspended: '公告披露停牌',
  trading: '公告披露可交易',
  unknown: '未知',
} as const;

export function BacktestTradingStatusDisclosure({ disclosure }: { disclosure: unknown }) {
  const parsed = backtestTradingStatusDisclosureV3Schema.safeParse(disclosure);
  if (!parsed.success) return null;
  const status = parsed.data;
  if (status.status === 'notIncluded')
    return (
      <Alert>
        <AlertTitle>停复牌：未纳入真实状态约束</AlertTitle>
        <AlertDescription>{status.reason}</AlertDescription>
      </Alert>
    );
  const { response } = status;
  const extended = response.days.some(
    (day) => day.riskWarning || day.dailyPriceLimit || day.listingPhase || day.noDailyPriceLimit,
  );
  const structured = Boolean(response.sourceRecords);
  const labels = structured
    ? { suspended: '来源标记停牌', trading: '来源标记可交易', unknown: '未知' }
    : stateLabel;
  let title = '停复牌：已使用冻结公告';
  if (extended) title = '历史状态与涨跌幅：已使用冻结公告';
  if (structured) title = '停复牌：已使用冻结结构化状态';
  let assumption = '未知日期沿用本次研究假设；公告披露可交易仍受其他执行规则约束。';
  if (extended)
    assumption = '未知维度沿用已选模型；已知涨跌幅独立约束原价执行，风险警示本身不等同停牌。';
  if (structured) assumption = '未知日期沿用本次研究假设；来源标记可交易仍受其他执行规则约束。';
  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        {status.fallbackReason && <div>{status.fallbackReason}</div>}
        <div>
          {response.symbol} · {formatDateOnly(response.range.start)} 至{' '}
          {formatDateOnly(response.range.end)}
        </div>
        <ul className="flex flex-col gap-1">
          {tradingStatusPeriods(response.days).map((period) => (
            <li key={period.start}>
              {labels[period.state]}：{formatDateOnly(period.start)}
              {period.end !== period.start && <> 至 {formatDateOnly(period.end)}</>}
            </li>
          ))}
        </ul>
        <BacktestStatusDimensions days={response.days} />
        <BacktestStructuredStatusFacts disclosure={status} />
        {response.days.some((day) => day.listingPhase) && (
          <div>
            未上市或已摘牌日禁止交易所成交；退市整理期仍受当日规则约束。缺失行情未补造，末次价格不代表摘牌后可变现价值。
          </div>
        )}
        {response.days
          .filter((day) => day.intradayHalts)
          .map((day) => (
            <div key={day.date} className="flex flex-col gap-1">
              <div>
                盘中暂停（{response.provenance.timezone}）：{formatDateOnly(day.date)}
              </div>
              {day.intradayHalts?.map((halt) => (
                <div key={halt.startedAt}>
                  {halt.startedAt} 至 {halt.endedAt ?? '恢复时刻未知'} · {halt.reason}
                </div>
              ))}
            </div>
          ))}
        {status.executionInterpretation && (
          <div>
            {status.executionInterpretation.reason} 排除日期：
            {status.executionInterpretation.excludedDates
              .map((date) => formatDateOnly(date))
              .join('、') || '无'}
          </div>
        )}
        <div>{assumption}</div>
        <ul className="flex flex-col gap-1">
          {response.sourceDocuments.map((document) => (
            <li key={document.id}>
              {/^(https?):\/\//iu.test(document.url) ? (
                <a href={document.url} target="_blank" rel="noopener noreferrer">
                  {document.title}
                </a>
              ) : (
                document.title
              )}
              {' · '}
              {document.kind === 'exchangePublication' ? '交易所公开记录' : '上市公司公告'}
              {' · '}
              {document.publishedDate ? formatDateOnly(document.publishedDate) : '发布日期未知'}
              {document.sha256 && <span className="break-all"> · 原件摘要 {document.sha256}</span>}
              {document.observedAt && <> · 实际核验 {formatDateTime(document.observedAt)}</>}
            </li>
          ))}
        </ul>
        <div>
          状态来源：{response.provenance.providerId} · {response.provenance.upstreamSource}
        </div>
        <div>采集时间：{formatDateTime(response.provenance.fetchedAt)}</div>
        <div className="break-all">状态数据版本：{response.provenance.providerRevision}</div>
        <div>
          历史首次可见时间尚未核验；本次按已取得{structured ? '结构化状态' : '公开公告'}
          用于本地研究。
        </div>
      </AlertDescription>
    </Alert>
  );
}
