import { useState } from 'react';
import { backtestStrategyPlanReadback, isPriceResearchStrategyDefinition } from '@thesis-ledger/domain';
import { useQuery } from '@tanstack/react-query';
import {
  optimizationModelResolutionRequestSchema,
  projectPriceResearchStrategy,
  priceResearchStrategySummary,
  strategySchema,
  type BacktestStrategy,
  type StrategyVersionRead,
} from '@thesis-ledger/schemas';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import {
  Action,
  Copy,
  Feedback,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import type { BacktestForm } from '../backtest-setup/backtest-intent';
import type { useStrategyLibrary } from '../strategy-library/useStrategyLibrary';

export function useOptimizationResearch(input: {
  source: 'existing' | 'discovery';
  versionId: string;
  discovery: string;
  form: BacktestForm;
  library: ReturnType<typeof useStrategyLibrary>;
  onAdopt: (versionId: string) => void;
}) {
  const { api, scope } = useMobileRuntime();
  const [adopted, setAdopted] = useState<StrategyVersionRead | null>(null);
  const owner = input.library.data?.find((strategy) =>
    strategy.versions.some((version) => version.id === input.versionId),
  );
  const version =
    adopted?.id === input.versionId
      ? adopted
      : owner?.versions.find((version) => version.id === input.versionId);
  const ready = input.source === 'discovery' || isPriceResearchStrategyDefinition(version?.schema);
  const parsed = strategySchema.safeParse(version?.schema);
  const projection =
    parsed.success && !ready && (parsed.data as BacktestStrategy).execution.mode === 'exchange' ? projectPriceResearchStrategy(parsed.data as BacktestStrategy) : null;
  let discoveryScope: unknown;
  try {
    discoveryScope = JSON.parse(input.discovery);
  } catch {
    discoveryScope = null;
  }
  const request = optimizationModelResolutionRequestSchema.safeParse({
    target:
      input.source === 'existing'
        ? { sourceMode: input.source, strategyVersionId: input.versionId }
        : { sourceMode: input.source, discoveryScope },
    startDate: input.form.start,
    endDate: input.form.end,
    currency: input.form.currency,
    adjustment: 'hfq',
  });
  const model = useQuery({
    queryKey: [...scope, 'optimization-research-model', request.success ? request.data : null],
    enabled: ready && request.success,
    queryFn: ({ signal }) => {
      if (!request.success) throw Error('请先填写有效的标的和实验区间');
      return api.strategy.optimization.resolveExecutionModel(request.data, signal);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
  const adopt = useMobileCommand(
    async () => {
      if (!owner || !projection) throw Error('当前策略定义不可用');
      const saved = await api.strategy.definitions.createVersion(owner.id, projection);
      setAdopted(saved);
      input.onAdopt(saved.id);
      await input.library.refetch();
    },
    { refresh: false },
  );
  return {
    ready,
    dailyOrders: input.source === 'existing' && parsed.success && (parsed.data as BacktestStrategy).execution.timing === 'dailyBarOrders',
    model,
    adopt,
    requestValid: request.success,
    summary: projection ? priceResearchStrategySummary(projection) : null,
    readback: projection ? backtestStrategyPlanReadback(projection) : [],
  };
}

export function OptimizationResearchChoice({
  value,
  disabled,
}: {
  value: ReturnType<typeof useOptimizationResearch>;
  disabled: boolean;
}) {
  if (!value.ready)
    return (
      <Section title="确认策略的研究口径">
        {value.summary && (
          <>
            {value.readback.map(line => <Copy key={line}>{line}</Copy>)}
          </>
        )}
        <Action
          label="采用研究口径并保存新版本"
          primary
          disabled={disabled || !value.summary || value.adopt.isPending}
          onPress={() => {
            void value.adopt.mutateAsync(undefined).catch(() => undefined);
          }}
        />
        <Feedback
          busy={value.adopt.isPending}
          error={value.adopt.isError}
          message={value.adopt.error ? failureMessage(value.adopt.error) : null}
        />
      </Section>
    );
  return (
    <Section title="模拟成交设置">
      {value.requestValid ? (
        <QueryStatus query={value.model} retry={() => void value.model.refetch()} />
      ) : (
        <Copy>填写有效标的与区间后自动准备。</Copy>
      )}
      {value.model.data?.status === 'available' &&
        value.model.data.notes?.map((note) => <Copy key={note}>{note}</Copy>)}
      {value.model.data?.status === 'blocked' && (
        <>
          <Copy>{value.model.data.message}</Copy>
          <Action
            label="重新准备成交设置"
            disabled={disabled || value.model.isFetching}
            onPress={() => void value.model.refetch()}
          />
        </>
      )}
    </Section>
  );
}
