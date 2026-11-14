import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export function MarketPolicyActions({
  disabled,
  saving,
  retrying,
  dirty,
  canRetry,
  canSave,
  count,
  onSave,
  onRetry,
}: {
  disabled: boolean;
  saving: boolean;
  retrying: boolean;
  dirty: boolean;
  canRetry: boolean;
  canSave: boolean;
  count: number;
  onSave: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canRetry && !dirty && (
        <Button type="button" variant="outline" onClick={onRetry} disabled={disabled || retrying}>
          {retrying && <Spinner data-icon="inline-start" />}
          {retrying ? '重试中…' : '重试应用'}
        </Button>
      )}
      <Button type="button" onClick={onSave} disabled={disabled || saving || !canSave}>
        {saving && <Spinner data-icon="inline-start" />}
        {saving ? '保存中…' : '保存全部修改（' + count + ' 项）'}
      </Button>
    </div>
  );
}
