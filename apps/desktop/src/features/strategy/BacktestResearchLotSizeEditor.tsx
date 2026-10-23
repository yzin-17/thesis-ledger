import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { BacktestExecutionModelV3, SecurityLotReference } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { applyResearchLotSize, researchLotSourceLabel } from './backtest-research-lot-size.model.js';
import { fetchSecurityLotSize } from '../market-data/security-lot-size.api.js';

type Props = { model: BacktestExecutionModelV3; onChange: (text: string) => void; onDraftChange: () => void };

export function BacktestResearchLotSizeEditor(props: Props) {
  const { scope, segments } = props.model;
  if (scope.market !== 'HK' || scope.instrumentType !== 'STOCK' || segments.some(segment =>
    segment.source.kind === 'historicalFact' || segment.execution.mode !== 'exchange' || segment.execution.normalizedExecution)) return null;
  return <ResearchLotEditor {...props} />;
}

function ResearchLotEditor({ model, onChange, onDraftChange }: Props) {
  const preset = model.researchLotSize;
  const [shares, setShares] = useState(preset?.sharesPerLot ?? '');
  const [reference, setReference] = useState<SecurityLotReference>();
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const lookup = useMutation({
    gcTime: 0, retry: false,
    mutationFn: async () => {
      const controller = new AbortController(); abort.current = controller;
      const value = await fetchSecurityLotSize(model.scope.symbol, controller.signal);
      controller.signal.throwIfAborted();
      return value;
    },
    onSuccess: value => {
      if (abort.current?.signal.aborted) return;
      setReference({ symbol: value.symbol, sharesPerLot: value.sharesPerLot,
        historicalChanges: value.historicalChanges, source: value.source });
      setShares(value.sharesPerLot); setError(null);
    },
    onError: () => {
      if (!abort.current?.signal.aborted)
        setError('每手股数查询失败，请检查独立路由和来源连接；已有研究预设仍可手动覆盖。');
    },
  });
  const defaultShares = reference?.sharesPerLot ?? preset?.defaultSharesPerLot;
  const source = reference?.source ?? preset?.source;
  return <FieldGroup>
    <Field data-invalid={Boolean(error)} data-disabled={lookup.isPending}>
      <FieldLabel>每手股数（研究预设）</FieldLabel>
      <Input aria-label="每手股数（研究预设）" aria-invalid={Boolean(error)} inputMode="numeric" value={shares}
        disabled={lookup.isPending}
        onChange={event => { setShares(event.target.value); setError(null); onDraftChange(); }} />
      <FieldDescription>{defaultShares ? `来源默认${defaultShares}股/手，可覆盖为正整数。` : '按独立主备路由查询当前每手股数。'}
        每手股数采用研究预设，未核验历史变更；数量按整手向下取整，采用值将随执行模型冻结。
        {source && ` 来源：${researchLotSourceLabel(source.provider)}；观察时间：${source.observedAt}。`}
      </FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
    <Button type="button" variant="outline" disabled={lookup.isPending} onClick={() => {
      setError(null); onDraftChange(); lookup.mutate();
    }}>{lookup.isPending ? '查询每手股数中…' : '按路由查询当前每手股数'}</Button>
    <Button type="button" variant="outline" disabled={lookup.isPending || !defaultShares} onClick={() => {
      try { onChange(JSON.stringify(applyResearchLotSize(model, shares, undefined, reference), null, 2)); setError(null); }
      catch (cause) { setError(cause instanceof Error ? cause.message : '每手股数配置无效'); }
    }}>应用每手股数并重新确认</Button>
  </FieldGroup>;
}
