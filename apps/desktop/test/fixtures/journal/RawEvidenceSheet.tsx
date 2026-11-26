import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export function RawEvidenceSheet({
  open,
  onOpenChange,
  title = '原始复盘证据',
  description = '只读查看本次复盘使用的结构化事实。',
  value,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  value: unknown;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="detail" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <pre className="overflow-x-auto rounded-lg border bg-muted/20 p-4 text-xs leading-5 whitespace-pre-wrap">
          {JSON.stringify(value, null, 2)}
        </pre>
      </SheetContent>
    </Sheet>
  );
}
