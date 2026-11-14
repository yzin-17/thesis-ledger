import type { OptimizationAdoptionContext } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingState, Spinner } from '@/components/ui/spinner';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { ExperimentAdoptionReview } from './StrategyExperimentDetailSections.js';

export function ExperimentAdoptionDialog({
  open,
  candidateNumber,
  context,
  loading,
  error,
  submitting,
  disabled,
  acknowledgeExposure,
  onRetry,
  onConfirm,
  onClose,
  returnFocus,
}: {
  open: boolean;
  candidateNumber: number | undefined;
  context: OptimizationAdoptionContext | undefined;
  loading: boolean;
  error: boolean;
  submitting: boolean;
  disabled: boolean;
  acknowledgeExposure: boolean;
  onRetry: () => void;
  onConfirm: () => void;
  onClose: () => void;
  returnFocus: () => HTMLElement | null;
}) {
  const close = () => {
    if (!submitting) onClose();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      <DialogContent
        finalFocus={returnFocus}
        showCloseButton={!submitting}
        className="max-h-[calc(100dvh-32px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[min(56rem,calc(100%-2rem))]"
      >
        <DialogHeader className="px-6 pt-6 pr-14 pb-4">
          <DialogTitle>审阅并采纳候选{candidateNumber ? ` ${candidateNumber}` : ''}</DialogTitle>
          <DialogDescription>
            新版本采用候选的完整策略定义，不自动合并实验开始后对正式版本所做的修改。
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pb-6">
          {loading ? <LoadingState label="正在读取策略差异" /> : null}
          {error ? <DataStateBanner state="error" onRetry={onRetry} /> : null}
          {!loading && !error && context ? (
            <ExperimentAdoptionReview context={context} acknowledgeExposure={acknowledgeExposure} />
          ) : null}
        </div>
        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="outline" disabled={submitting} onClick={close}>
            取消
          </Button>
          <Button
            aria-busy={submitting}
            disabled={submitting || disabled || loading || error || !context}
            onClick={onConfirm}
          >
            {submitting ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
            {submitting ? '正在采纳…' : '确认采纳'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
