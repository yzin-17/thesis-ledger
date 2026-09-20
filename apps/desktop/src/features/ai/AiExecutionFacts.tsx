import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { AiExecutionReadModel } from '@thesis-ledger/schemas';
import { aiExecutionDisplay } from './ai-execution-display.js';

export function AiExecutionFacts({
  execution,
  legacy,
  compact = false,
}: {
  execution?: AiExecutionReadModel | null;
  legacy?: { inputTokens?: number; outputTokens?: number };
  compact?: boolean;
}) {
  const display = aiExecutionDisplay(execution, legacy);
  if (compact) {
    return (
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>
          Token：{display.tokenText} · {display.completenessLabel}
        </span>
        {display.costLines.map((line) => (
          <span key={line}>AI 费用：{line}</span>
        ))}
        {display.blockedReason && <span>{display.blockedReason}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {display.blockedReason && (
        <Alert>
          <AlertTitle>后续执行已停止</AlertTitle>
          <AlertDescription>{display.blockedReason}</AlertDescription>
        </Alert>
      )}
      <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">生成 / 计量完整性</dt>
          <dd>
            {display.generationStatusLabel} · {display.completenessLabel}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">输入 / 输出 Token</dt>
          <dd>{display.tokenText}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">AI 费用事实</dt>
          <dd className="flex flex-col gap-1">
            {display.costLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">未确认预留</dt>
          <dd className="flex flex-col gap-1">
            {display.reservationLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">冻结执行策略</dt>
          <dd className="flex flex-col gap-1">
            {display.policyLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">绝对执行期限</dt>
          <dd>{display.deadlineText}</dd>
        </div>
      </dl>
    </div>
  );
}
