import type { RuleMonitorVersionDetail } from '@thesis-ledger/schemas';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const reasons = {
  legacy_missing:
    '此版本尚无正文快照；下次成功观察到相同内容时会保存当次正文，无法还原更早时点的原文。',
  text_unavailable: '此文件没有可提取的文字，暂不能展示正文或比较文字差异。',
  pdf_encrypted: '此 PDF 已加密，无法提取正文。',
  extraction_failed: '此文件正文解析失败，已保留版本指纹。',
  extraction_timeout: '此文件正文解析超时，已保留版本指纹。',
  text_too_large: '此文件正文超过保存上限，已保留版本指纹。',
};
const formats = { html: '网页正文', docx: '文档正文', pdf: 'PDF 提取文字', json: '资料包内容' };
const markers = {
  added: { label: '新增', symbol: '+' },
  removed: { label: '删除', symbol: '−' },
  context: { label: '上下文', symbol: ' ' },
  separator: { label: '省略未变内容', symbol: ' ' },
};

export function RuleSourceVersionContent({ data }: { data: RuleMonitorVersionDetail }) {
  const { snapshot, comparison } = data;
  return (
    <Tabs defaultValue={comparison ? 'diff' : 'snapshot'}>
      <TabsList variant="line" aria-label="版本内容">
        <TabsTrigger value="diff">版本差异</TabsTrigger>
        <TabsTrigger value="snapshot">正文快照</TabsTrigger>
      </TabsList>
      <TabsContent value="snapshot">
        {snapshot.status === 'unavailable' ? (
          <p className="text-sm text-muted-foreground">{reasons[snapshot.reason]}</p>
        ) : (
          <div className="grid min-w-0 gap-3">
            <p className="text-xs text-muted-foreground">
              {formats[snapshot.format]} · 快照采集{' '}
              {new Date(snapshot.capturedAt).toLocaleString('zh-CN', { hour12: false })}
            </p>
            <pre
              aria-label="已保存正文"
              className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-md border p-3 font-sans text-sm leading-relaxed"
            >
              {snapshot.text}
            </pre>
            {snapshot.format === 'pdf' ? (
              <p className="text-xs text-muted-foreground">文字顺序可能与 PDF 页面排版不同。</p>
            ) : null}
          </div>
        )}
      </TabsContent>
      <TabsContent value="diff">
        {!comparison ? (
          <p className="text-sm text-muted-foreground">
            目前只有一个内容版本；保存另一个版本后可比较差异。
          </p>
        ) : null}
        {comparison?.status === 'unavailable' ? (
          <p className="text-sm text-muted-foreground">
            {comparison.reason === 'diff_too_large'
              ? '两个版本的比较内容超过上限，请分别查看已保存正文。'
              : '所选版本或比较基准缺少正文快照，无法计算具体差异。可切换其他版本或查看已有正文。'}
          </p>
        ) : null}
        {comparison?.status === 'available' ? (
          <div className="grid min-w-0 gap-3">
            <p className="text-sm">
              相对比较基准，新增 {comparison.added} 行，删除 {comparison.removed} 行。
            </p>
            {comparison.lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                两个快照的文字内容一致；文件排版等变化仍可能导致原始文件指纹不同。
              </p>
            ) : (
              <ol
                aria-label="正文差异"
                className="max-h-96 min-w-0 overflow-y-auto rounded-md border text-sm leading-relaxed"
              >
                {comparison.lines.map((line, index) => (
                  <li
                    key={index}
                    className={cn(
                      'flex min-w-0 gap-2 px-3 py-1',
                      line.type === 'added' && 'bg-accent text-accent-foreground',
                      line.type === 'removed' && 'bg-destructive/10 text-destructive',
                    )}
                  >
                    <span className="shrink-0 select-none" aria-label={markers[line.type].label}>
                      {markers[line.type].symbol}
                    </span>
                    <span className="min-w-0 whitespace-pre-wrap break-words">{line.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
