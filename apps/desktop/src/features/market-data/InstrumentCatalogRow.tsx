import { instrumentConfirmationPresentation } from '@thesis-ledger/api-client';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InstrumentResult } from './market-data.types.js';

export function InstrumentCatalogRow({ instrument, confirmingId, onDetails, onConfirm }: {
  instrument: InstrumentResult;
  confirmingId: string | null;
  onDetails?: (() => void) | undefined;
  onConfirm: () => void;
}) {
  const confirmation = instrumentConfirmationPresentation(instrument);
  return (
    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <strong className="block truncate text-sm font-medium">{instrument.displayName}</strong>
        <span className="font-mono text-xs text-muted-foreground">{instrument.symbol} · {instrument.instrumentType}</span>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        {onDetails && <Button type="button" size="sm" variant="outline"
          aria-label={`查看 ${instrument.symbol} 行情`} onClick={onDetails}>行情详情</Button>}
        <Button type="button" size="sm" variant="outline" title={confirmation.description}
          disabled={confirmation.status !== 'unconfirmed' || confirmingId !== null} onClick={onConfirm}>
          {confirmingId === instrument.id && <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
          {confirmation.label}
        </Button>
      </div>
    </div>
  );
}
