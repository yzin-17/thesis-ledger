import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';

export function JournalReviewEmptyActions({
  onManualReview,
  onAdvancedJson,
}: {
  onManualReview: () => void;
  onAdvancedJson: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button type="button" onClick={onManualReview}>
        手动复盘
      </Button>
      <Button type="button" variant="outline" onClick={onAdvancedJson}>
        高级 JSON
      </Button>
    </div>
  );
}

export function JournalReviewSelectionPrompt({
  onManualReview,
  onAdvancedJson,
}: {
  onManualReview: () => void;
  onAdvancedJson: () => void;
}) {
  return (
    <Card size="sm" className="shadow-none">
      <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
        <CardTitle>选择一笔已平仓交易</CardTitle>
        <CardDescription>先核对证据，再开始确定性复盘。没有候选时可以手动输入。</CardDescription>
        <JournalReviewEmptyActions
          onManualReview={onManualReview}
          onAdvancedJson={onAdvancedJson}
        />
      </CardContent>
    </Card>
  );
}
