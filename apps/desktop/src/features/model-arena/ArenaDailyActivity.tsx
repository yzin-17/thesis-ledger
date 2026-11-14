import type { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { Button } from '@/components/ui/button';
import { FilterReset } from '@/components/ui/filter-bar';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingState } from '@/components/ui/spinner';
import { ArenaNotice } from './ArenaDetailShell.js';
import { ArenaDailyRound } from './ArenaDailyRound.js';
type Detail = Awaited<ReturnType<ThesisLedgerApiClient['modelArenas']['get']>>;
type Report = Awaited<ReturnType<ThesisLedgerApiClient['modelArenas']['round']>>;
function ActivitySelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Field className="min-w-0 sm:max-w-sm">
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue>{options.find((o) => o.id === value)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
export function ArenaDailyActivity(props: {
  detail: Detail;
  roundId: string | null;
  modelId: string | null;
  report: Report | undefined;
  loading: boolean;
  error: boolean;
  invalid: boolean;
  onRoundChange: (id: string) => void;
  onModelChange: (id: string | null) => void;
  onClear: () => void;
  onRetry: () => void;
}) {
  const control = arenaDailyActivityMaterials(props);
  const {
    detail,
    dates,
    invalid,
    roundId,
    onRoundChange,
    modelId,
    models,
    onModelChange,
    onClear,
    loading,
    error,
    onRetry,
    report,
  } = control;

  return (
    <div className="grid min-w-0 gap-6">
      {detail.rounds.length >= 50 && (
        <p className="text-xs text-muted-foreground">日期列表仅显示最近 50 轮。</p>
      )}
      {(dates.length > 0 || invalid) && (
        <div className="grid min-w-0 items-end gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,24rem)_auto]">
          {roundId && (
            <ActivitySelect
              label="交易日期"
              value={roundId}
              options={dates}
              onChange={onRoundChange}
            />
          )}
          <ActivitySelect
            label="参赛模型"
            value={modelId ?? 'all'}
            options={models}
            onChange={(id) => onModelChange(id === 'all' ? null : id)}
          />
          <FilterReset
            className="w-fit"
            hasConditions={Boolean(modelId || invalid)}
            onReset={onClear}
          />
        </div>
      )}
      {invalid && (
        <ArenaNotice
          title="记录链接无效"
          action={
            <Button variant="outline" size="sm" onClick={onClear}>
              重新选择记录
            </Button>
          }
        >
          请选择交易日期和参赛模型后查看记录。
        </ArenaNotice>
      )}
      {!invalid && !roundId && (
        <ArenaNotice title="尚无决策与成交记录">
          比赛产生轮次后，这里会按日期展示已保存的模型决策与模拟成交。
        </ArenaNotice>
      )}
      {!invalid && roundId && loading && <LoadingState label="正在读取决策与成交" />}
      {!invalid && error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p>所选日期的记录读取失败，请重试或重新选择日期。</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            重试读取记录
          </Button>
          <Button variant="outline" size="sm" onClick={onClear}>
            重新选择记录
          </Button>
        </div>
      )}
      {!invalid && report?.id === roundId && <ArenaDailyRound report={report} entrant={modelId} />}
    </div>
  );
}

function arenaDailyActivityMaterials({
  detail,
  roundId,
  modelId,
  report,
  loading,
  error,
  invalid,
  onRoundChange,
  onModelChange,
  onClear,
  onRetry,
}: {
  detail: Detail;
  roundId: string | null;
  modelId: string | null;
  report: Report | undefined;
  loading: boolean;
  error: boolean;
  invalid: boolean;
  onRoundChange: (id: string) => void;
  onModelChange: (id: string | null) => void;
  onClear: () => void;
  onRetry: () => void;
}) {
  const dates = detail.rounds.map((r) => ({ id: r.id, label: r.tradingDate }));
  if (roundId && !dates.some((r) => r.id === roundId))
    dates.unshift({ id: roundId, label: report?.tradingDate ?? '所选日期（尚未取得记录）' });
  const models = [
    { id: 'all', label: '全部模型' },
    ...detail.entrants.map((e) => ({ id: e.id, label: e.model + ' · ' + e.providerId })),
  ];
  if (modelId && !models.some((m) => m.id === modelId))
    models.push({ id: modelId, label: '所选模型（此比赛未找到）' });

  return {
    detail,
    dates,
    invalid,
    roundId,
    onRoundChange,
    modelId,
    models,
    onModelChange,
    onClear,
    loading,
    error,
    onRetry,
    report,
  };
}
