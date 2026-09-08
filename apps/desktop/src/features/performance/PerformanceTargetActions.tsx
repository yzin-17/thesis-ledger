import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PerformanceTargetActions({
  saving,
  valid,
  onCancel,
  onSave,
}: {
  saving: boolean;
  valid: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onCancel}>
        取消
      </Button>
      <Button type="button" size="sm" disabled={!valid || saving} onClick={onSave}>
        {saving ? (
          <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
        ) : null}
        保存目标
      </Button>
    </div>
  );
}
