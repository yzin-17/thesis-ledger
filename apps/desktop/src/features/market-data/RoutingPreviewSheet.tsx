import type { RoutingConfigPreview } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { routeKeyLabelV3 } from './market-data-routes-v3.js';

export function RoutingPreviewSheet({
  preview,
  pendingRecommendations = 0,
  saving,
  error,
  onClose,
  onSave,
}: {
  preview: RoutingConfigPreview;
  pendingRecommendations?: number;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Sheet open onOpenChange={(open) => !open && !saving && onClose()}>
      <SheetContent size="detail" className="max-sm:w-full max-sm:max-w-full">
        <SheetHeader>
          <SheetTitle>确认保存配置</SheetTitle>
          <SheetDescription>
            {preview.changes.length} 项来源变更，
            {preview.changes.filter((item) => !item.next.length).length} 项清空，保留{' '}
            {preview.exceptions} 项细分例外。
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {pendingRecommendations > 0 && (
            <p role="status" className="m-0 text-sm text-foreground">
              {pendingRecommendations} 项建议待选择，本次保留这些项的原配置。
            </p>
          )}
          {Number(preview.legacyRuleCount) > 0 && (
            <p className="text-sm text-foreground">
              整理 {preview.legacyRuleCount} 项旧汇总配置，各项改为继承大类或单独设置。
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!preview.changes.length && (
            <p className="text-sm text-foreground">精确来源保持不变，保存分级规则及能力范围。</p>
          )}
          <ul className="m-0 list-none p-0">
            {preview.changes.map((item) => (
              <li key={JSON.stringify(item.key)} className="flex flex-col gap-2 border-b py-3">
                <strong className="text-sm">{routeKeyLabelV3(item.key)}</strong>
                <span className="break-words text-xs text-muted-foreground">
                  原配置：{item.previous.join(' / ') || '未配置'}
                </span>
                <span className="break-words text-sm text-foreground">
                  新配置：{item.next.join(' / ') || '未配置'}
                </span>
              </li>
            ))}
          </ul>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            返回修改
          </Button>
          <Button disabled={saving} onClick={onSave}>
            {saving ? '正在保存' : '确认保存'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
