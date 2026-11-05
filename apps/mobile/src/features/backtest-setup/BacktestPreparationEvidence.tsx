import { useState } from 'react';
import type { BacktestNavPreparationResultV3, BacktestRunPreparationResultV3 } from '@thesis-ledger/schemas';
import { Action, Copy } from '../../components/MobilePrimitives';
type Preparation = BacktestNavPreparationResultV3 | BacktestRunPreparationResultV3;
export function BacktestPreparationEvidence({ value }: { value: Preparation }) {
  const [expanded, setExpanded] = useState(false);
  if (value.status !== 'prepared') return <Copy>{JSON.stringify(value, null, 2)}</Copy>;
  const source = value.actualSource;
  const target = 'routeTarget' in source ? source.routeTarget : source.provenance;
  const stamp = 'binding' in value ? value.binding : value.executionPreflight.revisionStamp;
  return (
    <>
      <Copy>区间 {value.runConfig.startDate} 至 {value.runConfig.endDate} · 币种 {value.runConfig.baseCurrency}</Copy>
      <Copy>冻结时点 {value.runConfig.dataAsOf}</Copy>
      <Copy>来源 {target.providerId} / {target.upstreamSource}</Copy>
      <Copy>策略指纹 {stamp?.strategyContentHash ?? '未返回'}</Copy>
      <Copy>配置指纹 {stamp?.runConfigChecksum ?? '未返回'}</Copy>
      {'receipt' in value && value.receipt ? <Copy>准备凭据 {value.receipt.preparationHash} · 有效至 {value.receipt.expiresAt}</Copy> : null}
      <Action label={expanded ? '收起完整准备证据' : '展开完整准备证据'} onPress={() => setExpanded((v) => !v)} />
      {expanded ? <Copy>{JSON.stringify(value, null, 2)}</Copy> : null}
    </>
  );
}
