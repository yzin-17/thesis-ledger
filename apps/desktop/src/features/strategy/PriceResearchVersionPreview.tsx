import { useMutation, useQueryClient } from '@tanstack/react-query';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import {
  projectPriceResearchStrategy,
  strategySchema,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { createStrategyVersion } from './strategy.api.js';
import { strategyKeys } from './strategy.queries.js';
import type { StrategyVersion } from './strategy.types.js';

export function PriceResearchVersionPreview({
  strategyId,
  version,
  disabled,
  onAdopt,
  onBusyChange,
}: {
  strategyId: string;
  version: StrategyVersion;
  disabled: boolean;
  onAdopt: (version: StrategyVersion) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const client = useQueryClient();
  const parsed = strategySchema.safeParse(version.schema);
  const projection = parsed.success
    ? projectPriceResearchStrategy(parsed.data as BacktestStrategy)
    : null;
  const lines = projection ? backtestStrategyPlanReadback(projection) : [];
  const save = useMutation({
    mutationFn: async () => {
      if (!projection) throw new Error('策略定义不可用');
      return createStrategyVersion({ strategyId, schema: projection });
    },
    onMutate: () => onBusyChange(true),
    onSuccess: (saved) => {
      onAdopt(saved);
      void client.invalidateQueries({ queryKey: strategyKeys.strategies() });
    },
    onSettled: () => onBusyChange(false),
  });
  if (!projection) return null;
  return (
    <Alert>
      <AlertTitle>确认策略的研究口径</AlertTitle>
      <AlertDescription>
        {lines.map(line => <p key={line}>{line}</p>)}
        <p>确认后保存为新版本，再准备本次研究。</p>
        <Button type="button" disabled={disabled || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? '正在保存…' : '采用研究口径并保存新版本'}
        </Button>
        {save.error && (
          <p role="alert">
            {save.error instanceof Error ? save.error.message : '版本保存失败，请重试'}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
