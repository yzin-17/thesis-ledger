import { ratioToPercentText } from '../ratio-percent.js';

const percentageRuleKinds: ReadonlySet<string> = new Set([
  'cost-stop',
  'take-profit',
  'position-concentration',
  'trailing-stop',
]);
const thresholdPercentFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 });
const thresholdNumberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 });
const thresholdSmallFormat = new Intl.NumberFormat('zh-CN', {
  notation: 'scientific',
  maximumFractionDigits: 6,
});

export const formatRiskRuleThreshold = (kind: string, threshold: number) => {
  const percentage = percentageRuleKinds.has(kind);
  const raw = percentage ? ratioToPercentText(threshold) : String(threshold);
  const formatter = percentage ? thresholdPercentFormat : thresholdNumberFormat;
  const format = formatter.format.bind(formatter) as (value: string | number | bigint) => string;
  let text = format(raw);
  if (threshold !== 0 && Number(text.replaceAll(',', '')) === 0) {
    const formatSmall = thresholdSmallFormat.format.bind(thresholdSmallFormat) as (
      value: string | number | bigint,
    ) => string;
    text = formatSmall(raw);
  }
  return percentage ? text + '%' : text;
};
