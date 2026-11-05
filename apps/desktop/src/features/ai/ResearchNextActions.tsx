import type { ResearchReportDetail } from '@thesis-ledger/schemas';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
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
    <Alert>
      <AlertTitle>{state.label}</AlertTitle>
      <AlertDescription>{state.description}</AlertDescription>
      <Button type="button" variant="outline" size="sm" onClick={onPrepare}>
        准备新研究
      </Button>
    </Alert>
  );
}
