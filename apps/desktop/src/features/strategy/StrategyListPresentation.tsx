import { Link } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { strategyCenterPath } from './strategy-center.navigation.js';
import {
  backtestProgressLabel,
  backtestResultSummary,
  formatCompactDateTime,
} from './strategy-list-presentation.js';
import { jobStatusLabel, jobStatusVariant } from './StrategySections.js';
import type { BacktestJobSummary } from './strategy.types.js';

export function StrategyListSearchField({
  value,
  placeholder,
  label,
  onChange,
  className,
}: {
  value: string;
  placeholder: string;
  label: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Field className={className}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          className="pl-9"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={label}
        />
      </div>
    </Field>
  );
}

export function StrategyLibraryToolbar({
  search,
  onSearchChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <StrategyListSearchField
        className="min-w-0 flex-1 sm:max-w-xl"
        value={search}
        onChange={onSearchChange}
        placeholder="搜索策略名称、说明或标的"
        label="搜索策略"
      />
      <Link to={strategyCenterPath.newStrategy} className={`${buttonVariants()} ml-auto`}>
        <Plus aria-hidden="true" />
        新建策略
      </Link>
    </div>
  );
}

export function BacktestStatusCell({ job }: { job: BacktestJobSummary }) {
  const progress = backtestProgressLabel(job);
  return (
    <>
      <Badge variant={jobStatusVariant(job.status)}>{jobStatusLabel(job.status)}</Badge>
      {progress ? (
        <p className="mt-1 truncate text-xs text-muted-foreground" title={progress}>
          {progress}
        </p>
      ) : null}
    </>
  );
}

export function StrategyRecentBacktest({ job }: { job: BacktestJobSummary | null }) {
  if (!job) return <span className="text-muted-foreground">未回测</span>;
  return (
    <Link
      className="inline-flex flex-col gap-1 hover:underline"
      to={strategyCenterPath.job(job.id)}
    >
      <Badge variant={jobStatusVariant(job.status)}>{jobStatusLabel(job.status)}</Badge>
      <span className="text-xs text-muted-foreground">
        {formatCompactDateTime(job.updatedAt ?? job.createdAt)}
      </span>
    </Link>
  );
}

export function BacktestResultCell({ job }: { job: BacktestJobSummary }) {
  const summary = backtestResultSummary(job);
  return (
    <p className="line-clamp-2 whitespace-normal" title={summary}>
      {summary}
    </p>
  );
}
