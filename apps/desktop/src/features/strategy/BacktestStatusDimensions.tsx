import { DecimalValue } from '@thesis-ledger/domain';
import type { MarketTradingStatusResponseV3 } from '@thesis-ledger/schemas';
import { formatDateOnly } from '@/lib/date-display';

const riskLabel = { active: '已实施', none: '无', unknown: '未知' } as const;
const listingLabel = { notListed: '尚未上市', initialListing: '上市初期', listed: '已上市',
  delistingPeriod: '退市整理期', delisted: '已摘牌' } as const;
export function BacktestStatusDimensions({
  days,
}: {
  days: MarketTradingStatusResponseV3['days'];
}) {
  const known = days.filter((day) => day.riskWarning || day.dailyPriceLimit || day.listingPhase || day.noDailyPriceLimit);
  if (!known.length) return null;
  return (
    <ul className="flex flex-col gap-1">
      {known.map((day) => (
        <li key={day.date}>
          {formatDateOnly(day.date)}
          {day.listingPhase && <> · 上市阶段：{listingLabel[day.listingPhase]}</>}
          {day.noDailyPriceLimit && <> · 不设日涨跌幅限制：{day.noDailyPriceLimit.reason}</>}
          {day.riskWarning && (
            <>
              {' '}
              · 退市风险警示：{riskLabel[day.riskWarning.delisting]}· 其他风险警示：
              {riskLabel[day.riskWarning.other]}
            </>
          )}
          {day.dailyPriceLimit && (
            <>
              {' '}
              · 日涨幅限制{' '}
              {DecimalValue.from(day.dailyPriceLimit.maxUpRatio).times('100').toString()}% ·
              日跌幅限制{' '}
              {DecimalValue.from(day.dailyPriceLimit.maxDownRatio).times('100').toString()}
              %（原始前收盘）
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
