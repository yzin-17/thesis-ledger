import { useQuery } from '@tanstack/react-query';
import type { ResearchSubmissionV2 } from '@thesis-ledger/schemas';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts, useValuation } from '../../app/query/mobile-queries';
import { Choices, Copy, QueryStatus, Section } from '../../components/MobilePrimitives';
import { InstrumentPicker } from '../market/InstrumentPicker';
export const researchScopeLabels = {
  instrument: '独立标的',
  portfolio: '全组合',
  account: '账户',
  position: '单个持仓',
  strategy: '策略版本',
} as const;
export function ResearchObjects({
  value,
  onChange,
  disabled = false,
}: {
  value: ResearchSubmissionV2['scope'];
  onChange: (v: ResearchSubmissionV2['scope']) => void;
  disabled?: boolean;
}) {
  const { api, scope } = useMobileRuntime();
  const accounts = useAccounts();
  const accountId = 'accountId' in value ? value.accountId : '';
  const positions = useValuation(accountId, value.scope === 'position' && Boolean(accountId));
  const strategies = useQuery({
    queryKey: [...scope, 'research-strategies'],
    queryFn: ({ signal }) => api.researchRuns.strategies(signal),
    enabled: value.scope === 'strategy',
    retry: false,
  });
  return (
    <Section title="研究对象">
      {value.scope === 'account' || value.scope === 'position' ? (
        <>
          <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
          <Choices
            label="研究账户"
            value={accountId}
            disabled={disabled}
            options={(accounts.data ?? [])
              .filter((a) => a.active)
              .map((a) => ({ value: a.id, label: a.name }))}
            onChange={(id) =>
              onChange(
                value.scope === 'position'
                  ? { scope: 'position', accountId: id, symbol: '' }
                  : { scope: 'account', accountId: id },
              )
            }
          />
        </>
      ) : null}
      {value.scope === 'position' ? (
        <>
          <QueryStatus query={positions} retry={() => void positions.refetch()} />
          <Choices
            label="研究持仓"
            value={value.symbol}
            disabled={disabled || positions.isError}
            options={(positions.data?.positions ?? []).map((p) => ({
              value: p.symbol,
              label: `${p.symbol} · ${p.asset?.name ?? '名称未记录'}`,
            }))}
            onChange={(symbol) => onChange({ ...value, symbol })}
          />
        </>
      ) : null}
      {value.scope === 'instrument' ? (
        <>
          <Copy>已选目录标的 {value.instrumentId || '未选择'}</Copy>
          {!disabled ? (
            <InstrumentPicker
              onConfirmed={(v) => onChange({ scope: 'instrument', instrumentId: v.id })}
            />
          ) : null}
        </>
      ) : null}
      {value.scope === 'strategy' ? (
        <>
          <QueryStatus query={strategies} retry={() => void strategies.refetch()} />
          <Choices
            label="研究策略版本"
            value={value.strategyVersionId}
            disabled={disabled || strategies.isError}
            options={(strategies.data ?? []).flatMap((s) =>
              s.versions.map((v) => ({ value: v.id, label: `${s.name} · v${v.version}` })),
            )}
            onChange={(strategyVersionId) => onChange({ scope: 'strategy', strategyVersionId })}
          />
        </>
      ) : null}
      {value.scope === 'portfolio' ? <Copy>服务端将按当前模式确认全组合范围。</Copy> : null}
    </Section>
  );
}
