import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToastManager } from '@/components/ui/toast';
import { LoaderCircle } from 'lucide-react';

import { createJournalReviewActions } from './journal.actions.js';
import { useBehaviorReviewMutation, useSingleTradeReviewMutation } from './journal.mutations.js';
import type { BehaviorReviewResult, JournalReviewResult, ReviewTrade } from './journal.types.js';

const defaultReviewTrade: ReviewTrade = {
  symbol: '600519.SH',
  entryAt: '2025-01-02T09:30:00.000Z',
  exitAt: '2025-01-06T09:30:00.000Z',
  pnl: -120,
  plannedStop: 1400,
  actualExit: 1388,
  plannedHoldingDays: 2,
  entryPrice: 1450,
  exitPrice: 1388,
  plannedEntry: 1440,
  plannedExit: 1510,
  turnover: 2900,
  peakWeight: 0.18,
  targetWeight: 0.1,
};

const defaultBehaviorTrades: ReviewTrade[] = [
  defaultReviewTrade,
  {
    ...defaultReviewTrade,
    symbol: '000001.SZ',
    entryAt: '2025-01-07T09:30:00.000Z',
    exitAt: '2025-01-08T09:30:00.000Z',
    pnl: 260,
    plannedStop: 10,
    actualExit: 12,
    entryPrice: 10.5,
    exitPrice: 13,
    plannedEntry: 10.5,
    plannedExit: 12.5,
  },
];

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

export function JournalDashboard() {
  const [tradeText, setTradeText] = useState(prettyJson(defaultReviewTrade));
  const [tradesText, setTradesText] = useState(prettyJson(defaultBehaviorTrades));
  const toastManager = useToastManager();
  const singleReviewMutation = useSingleTradeReviewMutation();
  const behaviorReviewMutation = useBehaviorReviewMutation();
  const [singleReview, setSingleReview] = useState<JournalReviewResult | null>(null);
  const [behaviorReview, setBehaviorReview] = useState<BehaviorReviewResult | null>(null);
  const reviewActions = createJournalReviewActions({
    singleReviewMutation,
    behaviorReviewMutation,
    setSingleReview: (result) => setSingleReview(result),
    setBehaviorReview: (result) => setBehaviorReview(result),
  });
  let busy: 'single' | 'behavior' | null = null;
  if (singleReviewMutation.isPending) busy = 'single';
  else if (behaviorReviewMutation.isPending) busy = 'behavior';

  const reviewSingleTrade = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const parsedTrade: unknown = JSON.parse(tradeText);
      if (!parsedTrade || typeof parsedTrade !== 'object' || Array.isArray(parsedTrade)) {
        throw new Error('trade');
      }
      const result = await reviewActions.reviewSingleTrade(parsedTrade as ReviewTrade);
      toastManager.add({
        title: '单笔复盘完成',
        description: result.aiRun
          ? 'AI 解释任务只接收已计算的事实。'
          : '确定性复盘完成；AI Provider 当前不可用。',
        type: result.aiRun ? 'success' : 'warning',
        timeout: result.aiRun ? 2800 : 7000,
      });
    } catch {
      toastManager.add({
        title: '单笔复盘失败',
        description: '请检查交易 JSON 和服务状态。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };

  const reviewBehavior = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const parsedTrades: unknown = JSON.parse(tradesText);
      if (!Array.isArray(parsedTrades) || parsedTrades.length === 0) throw new Error('trades');
      const result = await reviewActions.reviewBehavior(parsedTrades as ReviewTrade[]);
      toastManager.add({
        title: '行为复盘完成',
        description: result.aiRun
          ? '报告引用 Journal/Behavior 的确定性结果。'
          : '确定性行为指标完成；AI Provider 当前不可用。',
        type: result.aiRun ? 'success' : 'warning',
        timeout: result.aiRun ? 2800 : 7000,
      });
    } catch {
      toastManager.add({
        title: '行为复盘失败',
        description: '请检查交易数组 JSON 和服务状态。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };

  return (
    <section className="module-page">
      <p className="kicker">Journal Review</p>
      <h1>投资复盘</h1>
      <p className="page-description">
        先计算计划、执行和行为事实，再交给 AI 做有证据边界的解释；反事实结果会明确假设，不会写入
        Ledger 或生成订单。
      </p>
      <form className="panel form-card" onSubmit={(event) => void reviewSingleTrade(event)}>
        <div className="panel-heading">
          <h2>Single Trade Review</h2>
          <p>输入一笔已平仓交易，查看计划偏差、行为指标和止损反事实。</p>
        </div>
        <label>
          CompletedTrade JSON
          <Textarea
            value={tradeText}
            onChange={(event) => setTradeText(event.target.value)}
            rows={12}
            spellCheck={false}
          />
        </label>
        <Button type="submit" variant="default" disabled={busy !== null}>
          {busy === 'single' && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {busy === 'single' ? '计算中…' : '分析单笔交易'}
        </Button>
      </form>
      {singleReview && (
        <section className="panel">
          <div className="panel-heading">
            <h2>单笔交易证据</h2>
            <p>以下字段来自 Journal/Behavior API；AI 仅接收这些结构化结果。</p>
          </div>
          <div className="module-grid">
            <div>
              <span>计划与实际</span>
              <pre>{prettyJson(singleReview.plannedVsActual)}</pre>
            </div>
            <div>
              <span>行为指标</span>
              <pre>{prettyJson(singleReview.behavior)}</pre>
            </div>
            <div>
              <span>反事实假设</span>
              <pre>{prettyJson(singleReview.counterfactual)}</pre>
            </div>
          </div>
          <p className="form-help">
            {singleReview.aiRun
              ? `AI 解释任务 ${singleReview.aiRun.id.slice(0, 8)} 已记录（${singleReview.aiRun.promptVersion}）。`
              : 'AI 解释未启动：当前 Provider 不可用。'}
          </p>
        </section>
      )}
      <form className="panel form-card" onSubmit={(event) => void reviewBehavior(event)}>
        <div className="panel-heading">
          <h2>AI Behavior Review</h2>
          <p>输入交易数组，生成明确时间窗口内的行为指标和可追溯解释任务。</p>
        </div>
        <label>
          CompletedTrade[] JSON
          <Textarea
            value={tradesText}
            onChange={(event) => setTradesText(event.target.value)}
            rows={14}
            spellCheck={false}
          />
        </label>
        <Button type="submit" variant="default" disabled={busy !== null}>
          {busy === 'behavior' && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {busy === 'behavior' ? '计算中…' : '生成行为复盘'}
        </Button>
      </form>
      {behaviorReview && (
        <section className="panel">
          <div className="panel-heading">
            <h2>行为复盘结果</h2>
            <p>行为标签不是心理诊断；缺少事实时，结果会保留 insufficient data。</p>
          </div>
          <div className="module-grid">
            <div>
              <span>行为指标</span>
              <pre>{prettyJson(behaviorReview.metrics)}</pre>
            </div>
            <div>
              <span>时间窗口汇总</span>
              <pre>{prettyJson(behaviorReview.window)}</pre>
            </div>
            <div>
              <span>AI 来源边界</span>
              <strong>
                {behaviorReview.aiRun
                  ? `${behaviorReview.aiRun.provider}/${behaviorReview.aiRun.model}`
                  : 'Provider 不可用'}
              </strong>
              <small>只解释已计算的 Journal、Ledger、Risk、Behavior 事实。</small>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
