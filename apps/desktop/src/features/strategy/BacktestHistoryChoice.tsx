import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export const backtestHistoryLabels = {
  'fixed-provider-snapshot': '使用本次取得的历史行情',
  'point-in-time': '仅使用当时可见的数据',
} as const;
export type BacktestHistoryBasis = keyof typeof backtestHistoryLabels;

export function BacktestHistoryChoice({
  value,
  onChange,
}: {
  value: BacktestHistoryBasis;
  onChange: (value: BacktestHistoryBasis) => void;
}) {
  return (
    <Field>
      <FieldLabel>历史数据使用方式</FieldLabel>
      <ToggleGroup
        aria-label="历史数据使用方式"
        value={[value]}
        onValueChange={(values) => {
          const next = values[0];
          if (next === 'fixed-provider-snapshot' || next === 'point-in-time') onChange(next);
        }}
      >
        {Object.entries(backtestHistoryLabels).map(([key, label]) => (
          <ToggleGroupItem key={key} value={key}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <FieldDescription>
        {value === 'fixed-provider-snapshot'
          ? '使用现在取得的历史行情，准备完成后冻结。复权价格可能包含后来分红、拆股的影响，不能保证与当年看到的数据一致。'
          : '只允许使用历史时点当时已公开、可取得的数据，避免后来信息影响结果。需要提供可验证的历史重建证据，普通历史行情不能直接视为满足要求。'}
      </FieldDescription>
    </Field>
  );
}
