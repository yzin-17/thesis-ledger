import { arenaDecisionPlanLines } from '@thesis-ledger/domain';
import type { ArenaLiveDecision, ArenaLiveAccount } from '@thesis-ledger/schemas';

export function ArenaPlanReadback({ decision, name, book }: { decision: ArenaLiveDecision; name: (symbol: string) => string; book?: ArenaLiveAccount | undefined }) {
  return <>{arenaDecisionPlanLines(decision, name, book).map((line, index) => <p key={index} className="wrap-anywhere">
    {line.split(/(\d{4}-\d{2}-\d{2})/).map((part, partIndex) => /^\d{4}-\d{2}-\d{2}$/.test(part)
      ? <span key={partIndex} className="whitespace-nowrap">{part}</span> : part)}
  </p>)}</>;
}
