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
import {
  isLocalHistoryProvider,
  localHistoryDateLabel,
  localHistoryScopeLabel,
} from './market-local-history.js';
import type { ProviderManifest } from './market-data.types.js';

export function LocalMaterialsSheet({
  providers,
  onClose,
}: {
  providers: ProviderManifest[];
  onClose: () => void;
}) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="detail" className="max-sm:w-full max-sm:max-w-full">
        <SheetHeader>
          <SheetTitle>本地资料</SheetTitle>
          <SheetDescription>
            按用途、标的和日期匹配完整资料。超出范围或资料冲突时返回具体缺项。
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <ul className="m-0 list-none p-0">
            {providers
              .filter(
                (provider) =>
                  isLocalHistoryProvider(provider) && provider.providerId !== 'local-materials',
              )
              .flatMap((provider) =>
                (provider.upstreamSources ?? []).map((source) => (
                  <li
                    key={`${provider.providerId}:${source.sourceId}`}
                    className="flex flex-col gap-2 border-b py-3"
                  >
                    <strong className="text-sm">{source.displayName}</strong>
                    <span className="text-sm text-foreground">
                      {localHistoryScopeLabel(source.localHistory)} ·{' '}
                      {localHistoryDateLabel(source.localHistory)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      资料版本：{source.localHistory?.datasetId ?? '未提供'}
                      ；准入以实际能力诊断为准。
                    </span>
                    {!source.localHistory?.documents?.length && (
                      <span className="text-xs text-muted-foreground">缺少可展示的组成文件。</span>
                    )}
                    {source.localHistory?.documents?.map((document) => (
                      <a
                        key={document.id}
                        href={document.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary underline"
                      >
                        {document.title}
                      </a>
                    ))}
                  </li>
                )),
              )}
          </ul>
        </SheetBody>
        <SheetFooter>
          <Button onClick={onClose}>完成</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
