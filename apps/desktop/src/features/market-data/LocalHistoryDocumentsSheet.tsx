import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ProviderManifest } from './market-data.types.js';
import { OfficialAnnouncements } from './OfficialAnnouncements.js';
import {
  localHistoryDateLabel,
  localHistoryProviderLabel,
  localHistoryScopeLabel,
} from './market-local-history.js';
import {
  filterLocalHistoryDocuments,
  localHistoryDocumentGroups,
} from './local-history-documents.js';

export function LocalHistoryDocumentsSheet({
  provider,
  onClose,
  onReadCheck,
}: {
  provider: ProviderManifest;
  onClose: () => void;
  onReadCheck: () => void;
}) {
  const [query, setQuery] = useState('');
  const groups = localHistoryDocumentGroups(provider);
  const visible = filterLocalHistoryDocuments(groups, query);
  const incomplete = (provider.upstreamSources ?? []).some(
    (source) => source.localHistory?.documents === undefined,
  );
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent size="form" className="min-h-0 overflow-hidden">
        <SheetHeader>
          <SheetTitle>{localHistoryProviderLabel(provider)} · 公告与规则资料</SheetTitle>
          <SheetDescription>
            查看已收录的原始文档、标的与资料类型。同一原文的多个用途合并展示，读取范围以各条资料记录为准。
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          {provider.providerId === 'official-states' &&
          provider.upstreamSources?.some((source) => source.documentCatalog === 'announcements') ? (
            <OfficialAnnouncements />
          ) : (
            <>
              <Input
                aria-label="搜索公告标题或标的"
                placeholder="搜索公告标题、证券代码或资料类型"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <p role="status" className="text-xs text-muted-foreground">
                共收录 {groups.length} 份原文，当前显示 {visible.length} 份
              </p>
              {incomplete && (
                <p className="text-sm text-muted-foreground">部分来源尚未提供公告清单。</p>
              )}
              <ul className="flex flex-col gap-3" aria-label="已收录公告与规则文档">
                {visible.map(({ document, references }) => (
                  <li key={document.url} className="flex flex-col gap-3 rounded-md border p-3">
                    <a
                      href={document.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-sm text-sm font-medium text-primary underline underline-offset-4 wrap-anywhere"
                    >
                      {document.title}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      发布日期：{document.publishedDate ?? '未提供'}
                    </p>
                    <ul className="flex flex-col gap-2 text-xs" aria-label="关联资料范围">
                      {references.map((reference) => (
                        <li
                          key={`${reference.sourceId}:${reference.document.id}`}
                          className="flex flex-col gap-1"
                        >
                          <span className="font-medium">{reference.sourceName}</span>
                          <span className="text-muted-foreground">
                            {localHistoryScopeLabel(reference.data)} ·{' '}
                            {localHistoryDateLabel(reference.data)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              {groups.length === 0 && !incomplete && (
                <p className="text-sm text-muted-foreground">
                  当前资料尚未收录原始公告或规则文档。
                </p>
              )}
              {groups.length > 0 && visible.length === 0 && (
                <p className="text-sm text-muted-foreground">没有匹配的公告或规则文档。</p>
              )}
            </>
          )}
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
          <Button onClick={onReadCheck}>检查读取能力</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
