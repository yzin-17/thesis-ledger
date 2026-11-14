import type { ResearchReportDetail } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { researchReportState, researchStateMeta } from './research-state-display.js';

export function ResearchNextActions({
  report,
  onPrepare,
}: {
  report: ResearchReportDetail;
  onPrepare: () => void;
}) {
  const key = researchReportState(report),
    state = researchStateMeta[key];
  if (key === 'queued' || key === 'running' || key === 'failed' || key === 'cancelled') return null;
  return (
    <section role="status" className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-sm font-semibold">{state.label}</h3>
        <p className="text-sm text-muted-foreground">{state.description}</p>
      </div>
      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onPrepare}>
        准备新研究
      </Button>
    </section>
  );
}
