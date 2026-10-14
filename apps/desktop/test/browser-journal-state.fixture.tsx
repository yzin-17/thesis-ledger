import { useState } from 'react';
import { Button } from '../src/components/ui/button.js';

const labels = {
  ready: '正常状态',
  active: '未结束周期',
  'unknown-time': '未知开仓时间',
  baseline: '基线估算成本',
  planned: '明确关联原计划',
  'cost-missing': '成本证据缺失',
  'fx-missing': '汇率证据缺失',
  'cost-conflict': '成本证据冲突',
  'close-slice': '独立减仓对象',
  legacy: '旧记录待确认',
  'legacy-ambiguous': '旧记录减仓歧义',
  'no-accounts': '无账户',
  'accounts-pending': '账户加载中',
  'accounts-error': '账户读取失败',
  'no-objects': '无候选对象',
  'candidate-error': '候选读取失败',
  'object-error': '对象读取失败',
  'analysis-error': '确定性分析失败',
  'save-error': '快照保存失败',
  'history-error': '历史读取失败',
  'ai-error': 'AI 执行失败',
  'period-error': '周期分析失败',
  'period-mixed': '周期与减仓混合样本',
  'period-empty': '空周期',
  paged: '两页候选',
  'stale-cursor': '第二页游标失效',
  'generation-conflict': '第二页投影世代冲突',
  'delayed-response': '延迟候选响应',
};
export type JournalBrowserState = keyof typeof labels;
export const journalBrowserStateFixture: { state: JournalBrowserState } = { state: 'ready' };
export function browserJournalFailure(url: URL, method: string | undefined) {
  const state = journalBrowserStateFixture.state;
  let fail = false;
  if (method === 'POST') {
    fail =
      (state === 'analysis-error' && url.pathname.endsWith('/analysis/object')) ||
      (state === 'period-error' && url.pathname.endsWith('/analysis/period')) ||
      (state === 'save-error' && url.pathname.endsWith('/review-snapshots'));
  } else {
    fail =
      (state === 'candidate-error' && url.pathname.endsWith('/review-candidates')) ||
      (state === 'object-error' && url.pathname.includes('/review-objects/')) ||
      (state === 'history-error' && url.pathname.includes('/review-snapshots'));
  }
  if (!fail) return null;
  return new Response(
    JSON.stringify({ message: `固定验收：${labels[state]}`, errorCode: 'FIXTURE_ERROR' }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );
}
export function JournalBrowserStateControls({
  onChange,
}: {
  onChange: (state: JournalBrowserState) => void;
}) {
  const [state, setState] = useState<JournalBrowserState>('ready');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p>固定验收状态：{labels[state]}</p>
      {Object.entries(labels).map(([key, label]) => (
        <Button
          key={key}
          size="sm"
          variant="outline"
          onClick={() => {
            const next = key as JournalBrowserState;
            journalBrowserStateFixture.state = next;
            setState(next);
            onChange(next);
          }}
        >
          验收：{label}
        </Button>
      ))}
    </div>
  );
}
