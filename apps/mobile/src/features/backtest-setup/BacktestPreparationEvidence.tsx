import { useState } from 'react';
import { formatMobileDateTime } from '../../app/date-display';
import type { BacktestNavPreparationResultV3, BacktestRunPreparationResultV3 } from '@thesis-ledger/schemas';
import { Action, Copy } from '../../components/MobilePrimitives';
import { PreparedPriceSources } from './PreparedPriceSources';
import { BacktestDailyMatchingDisclosure } from './BacktestDailyMatchingFields';
type Preparation = BacktestNavPreparationResultV3 | BacktestRunPreparationResultV3;
export function BacktestPreparationEvidence({ value }: { value: Preparation }) {
  const [expanded, setExpanded] = useState(false);
  if (value.status !== 'prepared') return <Copy>{JSON.stringify(value, null, 2)}</Copy>;
  const source = value.actualSource;
  const target = 'routeTarget' in source ? source.routeTarget : source.provenance;
  const stamp = 'binding' in value ? value.binding : value.executionPreflight.revisionStamp;
  const formatTime = (time: string) => formatMobileDateTime(time, value.runConfig.valuationPolicy.baseTimezone);
  return (
    <>
      <Copy>区间 {value.runConfig.startDate} 至 {value.runConfig.endDate} · 币种 {value.runConfig.baseCurrency}</Copy>
      <Copy>冻结时点 {formatTime(value.runConfig.dataAsOf)}</Copy>
      {'executionPriceProtocol' in value.runConfig && <BacktestDailyMatchingDisclosure policy={value.runConfig.dailyOrderMatching} unit={value.runConfig.executionPriceProtocol.accountingBasis === 'normalized-series' ? '研究单位' : '实际股／份'} />}
      {'executionPreflight' in value ? <PreparedPriceSources value={value} /> : <Copy>来源 {target.providerId} / {target.upstreamSource}</Copy>}
      <Copy>策略指纹 {stamp?.strategyContentHash ?? '未返回'}</Copy>
      <Copy>配置指纹 {stamp?.runConfigChecksum ?? '未返回'}</Copy>
      {'receipt' in value && value.receipt ? <Copy>准备凭据 {value.receipt.preparationHash} · 有效至 {formatTime(value.receipt.expiresAt)}</Copy> : null}
      <Action label={expanded ? '收起完整准备证据' : '展开完整准备证据'} onPress={() => setExpanded((v) => !v)} />
      {expanded ? <Copy>{JSON.stringify(value, null, 2)}</Copy> : null}
    </>
  );
}
