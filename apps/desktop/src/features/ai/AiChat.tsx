import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToastManager } from '@/components/ui/toast';
import { LoaderCircle } from 'lucide-react';

import type { LoadState } from '../shared/types.js';
import { isDataLoaded } from '../shared/display.js';
import { EmptyTableRow } from '../shared/EmptyStates.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';

const researchScopeLabel = (scope: string) => {
  if (scope === 'portfolio') return '全组合';
  if (scope === 'account') return '账户';
  if (scope === 'position') return '单个持仓';
  return '策略版本';
};
import { useCreateAiRunMutation } from './ai.mutations.js';
import { resolveAiRunsLoadState, useAiRunsQuery } from './ai.queries.js';
import type { AiResearchScope, AiRunRecord, AiRunResult } from './ai.types.js';

export function AiChat() {
  const [scope, setScope] = useState<AiResearchScope>('portfolio');
  const [symbol, setSymbol] = useState('600519.SH');
  const [question, setQuestion] = useState('请收集证据并说明当前主要风险。');
  const [run, setRun] = useState<AiRunResult | null>(null);
  const toastManager = useToastManager();
  const runsQuery = useAiRunsQuery();
  const createRun = useCreateAiRunMutation();
  const history: AiRunRecord[] = runsQuery.data ?? [];
  const busy = createRun.isPending;
  const loadState: LoadState = resolveAiRunsLoadState({
    isPending: runsQuery.isPending,
    isError: runsQuery.isError,
    isSuccess: runsQuery.isSuccess,
    hasRuns: history.length > 0,
  });

  const loadHistory = () => runsQuery.refetch();
  const startResearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    try {
      const nextRun = await createRun.mutateAsync({
        provider: 'mock',
        model: 'research-default',
        promptVersion: 'research-v1',
        context: { scope, ...(scope === 'position' ? { symbol } : {}) },
      });
      setRun(nextRun);
      toastManager.add({
        title: '研究任务已创建',
        description: `已记录研究问题：${question}`,
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '研究任务创建失败',
        description: '请检查 Provider 状态和服务连接。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };
  return (
    <section className="module-page">
      <p className="kicker">Research Assistant</p>
      <h1>研究助手</h1>
      <p className="page-description">
        先选择研究上下文，再由只读 Tool 提供行情、财务、新闻、风险和回测事实；助手不会写入 Ledger
        或生成订单。
      </p>
      <Button
        className="secondary"
        type="button"
        variant="outline"
        onClick={() => void loadHistory()}
      >
        刷新研究历史
      </Button>
      <form className="panel form-card" onSubmit={(event) => void startResearch(event)}>
        <label>
          上下文
          <Select value={scope} onValueChange={(value) => value && setScope(value)}>
            <SelectTrigger className="w-full">
              <SelectValue>{researchScopeLabel(scope)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="portfolio">全组合</SelectItem>
                <SelectItem value="account">账户</SelectItem>
                <SelectItem value="position">单个持仓</SelectItem>
                <SelectItem value="strategy">策略版本</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        {scope === 'position' && (
          <label>
            标的
            <Input value={symbol} onChange={(event) => setSymbol(event.target.value)} />
          </label>
        )}
        <label>
          研究问题
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
          />
        </label>
        <Button disabled={busy} type="submit" variant="default">
          {busy && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {busy ? '创建中…' : '创建研究任务'}
        </Button>
      </form>
      <DataStateBanner state={loadState} onRetry={() => void loadHistory()} />
      {run && (
        <section className="panel">
          <div className="panel-heading">
            <h2>研究任务 {run.id.slice(0, 8)}</h2>
            <p>
              {run.provider}/{run.model} · Prompt {run.promptVersion}
            </p>
          </div>
          <div className="module-grid">
            <div>
              <span>上下文</span>
              <strong>{scope}</strong>
            </div>
            <div>
              <span>来源链</span>
              <strong>Tool 调用记录</strong>
            </div>
            <div>
              <span>执行边界</span>
              <strong>只读研究</strong>
            </div>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>研究历史</h2>
          <p>每条任务保留 context metadata，便于区分全组合、账户、持仓和策略研究。</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>任务</th>
                <th>上下文</th>
                <th>Provider / Model</th>
                <th>状态</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {isDataLoaded(loadState) && history.length === 0 ? (
                <EmptyTableRow colSpan={5} />
              ) : (
                history.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.id.slice(0, 8)}</strong>
                      <span>{item.promptVersion}</span>
                    </td>
                    <td>
                      {item.context?.scope ?? '未知'}
                      {item.context?.symbol ? ` · ${item.context.symbol}` : ''}
                    </td>
                    <td>
                      {item.provider} / {item.model}
                    </td>
                    <td>{item.status}</td>
                    <td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
