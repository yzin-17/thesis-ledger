import { useState, type ReactNode } from 'react';
import { routingScopeId } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import type { RoutingRecommendationDecision } from './routing-recommendation.js';
import { routingScopePath } from './routing-scope-tree.js';

export function RoutingRecommendationReview({ decisions, onAdopt, onUndo, onSelectPending, children }: {
  decisions: RoutingRecommendationDecision[] | undefined;
  onAdopt: () => void;
  onUndo: () => void;
  onSelectPending: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pending = decisions?.filter((item) => item.status === 'pending').length ?? 0;
  return <div className="flex min-w-0 flex-col gap-2">
    <div className="flex flex-wrap items-center gap-2">
      {children}
      {pending > 0 && <Button variant="outline" size="sm" onClick={onSelectPending}>待选择 {pending} 项</Button>}
      {decisions ? <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? '收起推荐理由' : '查看推荐理由'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setOpen(false); onUndo(); }}>撤销本类建议</Button>
      </div> : <>
        <Button variant="outline" size="sm" onClick={() => { setOpen(false); onAdopt(); }}>采用建议主备</Button>
        <span className="text-xs text-muted-foreground">按可用来源配置本类全部细分项</span>
      </>}
    </div>
    {pending > 0 && <p role="status" className="m-0 text-xs text-muted-foreground">
      待选择项保留原配置，可先保存已确定的建议。
    </p>}
    {decisions && open && <ul className="m-0 flex min-w-0 list-none flex-col gap-2 p-0">
      {decisions.map((item) => <li key={routingScopeId(item.scope)} className="min-w-0 text-xs">
        <span className="text-foreground">{routingScopePath(item.scope)}</span>
        <p className="m-0 text-muted-foreground">{item.reason}</p>
      </li>)}
    </ul>}
  </div>;
}
