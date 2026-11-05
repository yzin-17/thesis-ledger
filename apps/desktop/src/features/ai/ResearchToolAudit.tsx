import type { AiToolCall } from './ai.types.js';
import { formatFullDateTime } from './ai.display.js';

const statusLabels: Record<string, string> = {
  ok: '已完成',
  unavailable: '不可用',
  denied: '权限拒绝',
};

export function ResearchToolAudit({ call }: { call: AiToolCall }) {
  const fields = [
    ['调用 ID', call.id ?? '未记录'],
    ['权限', call.permission],
    ['来源', call.provider ?? '未记录'],
    ['输入', call.inputSummary],
    ['输出', call.outputSummary ?? '未记录'],
    ['耗时', call.durationMs === undefined ? '未记录' : `${call.durationMs} 毫秒`],
    ['市场时间', formatFullDateTime(call.marketTime)],
    ['可用时间', formatFullDateTime(call.availableAt)],
    ['抓取时间', formatFullDateTime(call.fetchedAt)],
    ['记录时间', formatFullDateTime(call.createdAt)],
  ];
  return (
    <details className="min-w-0 rounded-md border bg-muted/20 p-3 text-xs">
      <summary className="cursor-pointer font-medium">
        {`Tool 审计：${call.tool} · ${statusLabels[call.status] ?? '未知状态'}`}
      </summary>
      <dl className="mt-3 grid min-w-0 gap-3">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-1 whitespace-pre-wrap wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
