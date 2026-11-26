import { strategyCapabilityGapSchema } from '@thesis-ledger/schemas';
import { strategyCapabilityGapLines } from '@thesis-ledger/domain';

export function StrategyCapabilityGap({ value }: { value: unknown }) {
  const parsed = strategyCapabilityGapSchema.safeParse(value);
  if (!parsed.success) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm md:col-span-4" aria-label="策略能力缺口">
      <h4 className="font-medium">能力缺口</h4>
      {strategyCapabilityGapLines(parsed.data).map((line, index) => (
        <p key={index} className="whitespace-pre-wrap break-words">
          {line}
        </p>
      ))}
    </div>
  );
}
