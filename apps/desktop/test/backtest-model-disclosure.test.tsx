import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  BacktestModelConfiguration,
  parseBacktestModelConfiguration,
} from '../src/features/strategy/BacktestModelConfiguration.js';
import { BacktestRunDisclosure } from '../src/features/strategy/BacktestModelDisclosure.js';
import { createStrategyActionHandlers } from '../src/features/strategy/strategy.actions.js';
import type { BacktestJob } from '../src/features/strategy/strategy.types.js';
const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const model = fixture('backtest-execution-model.cn-2024q1.json');
const strategy = fixture('backtest-v2.exchange.json');
const setup = {
  period: { start: '2024-01-02', end: '2024-03-29' },
  initialCash: 1000000,
  dataAsOf: '2024-03-29T16:00:00Z',
};
describe('策略回测模型披露', () => {
  it('详情保留列表已本地化错误的原始摘要、错误码和诊断', () => {
    const html = renderToStaticMarkup(<BacktestRunDisclosure job={{ id: 'run', strategyVersionId: 'version', status: 'failed', errorSummary: 'Artifact 校验失败', errorCode: 'DATA_UNAVAILABLE', diagnostics: { code: 'ARTIFACT_INVALID', message: 'Artifact 校验失败', path: ['snapshot'] } }} />);
    expect(html).toContain('Artifact 校验失败');
    expect(html).toContain('DATA_UNAVAILABLE');
    expect(html).toContain('ARTIFACT_INVALID');
    expect(html).toContain('snapshot');
  });
  it('执行模型配置拒绝无效 JSON', () => {
    expect(parseBacktestModelConfiguration('')).toEqual({ model: undefined, error: null });
    expect(parseBacktestModelConfiguration('{')).toMatchObject({
      model: undefined,
      error: expect.any(String),
    });
  });
  it('配置展示范围、来源、假设并提供显式确认', () => {
    const markup = renderToStaticMarkup(
      <BacktestModelConfiguration
        text={JSON.stringify(model)}
        confirmed={false}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    for (const text of [
      '确认以上范围与假设',
      model.id,
      model.segments[0].source.description,
      model.segments[0].source.revision,
      model.segments[0].assumptions[0],
      '600519.SH',
      'CNY',
    ])
      expect(markup).toContain(text);
    expect(
      renderToStaticMarkup(
        <BacktestModelConfiguration
          text={JSON.stringify(model)}
          confirmed
          onChange={vi.fn()}
          onConfirm={vi.fn()}
        />,
      ),
    ).toContain('已确认执行模型');
  });
  it('冻结来源和 partial 分开展示，失败原文和旧响应不丢失', () => {
    const job = {
      id: 'run',
      strategyVersionId: 'version',
      status: 'succeeded',
      result: {
        completeness: 'partial',
        executionModelDisclosure: { model, contentHash: 'frozen-model-hash' },
      },
    } as BacktestJob;
    const markup = renderToStaticMarkup(<BacktestRunDisclosure job={job} />);
    expect(markup).toContain('部分完整');
    expect(markup).toContain('frozen-model-hash');
    expect(markup).toContain('已冻结的执行模型');
    const failed = renderToStaticMarkup(
      <BacktestRunDisclosure
        job={{
          id: 'old',
          strategyVersionId: 'version',
          status: 'failed',
          errorCode: 'DATA_UNAVAILABLE',
          errorSummary: 'historical status unavailable: 600519.SH',
          diagnostics: { code: 'MARKET_RULES_UNAVAILABLE' },
        }}
      />,
    );
    for (const text of [
      'historical status unavailable: 600519.SH',
      'MARKET_RULES_UNAVAILABLE',
      '未提供执行模型披露',
    ])
      expect(failed).toContain(text);
  });
  it('未准备的配置不会提交回测', async () => {
    const add = vi.fn();
    const load = vi.fn(async () => undefined);
    const queue = vi.fn(async () => ({
      id: 'run',
      strategyVersionId: 'version',
      status: 'failed',
      errorCode: 'DATA_UNAVAILABLE',
      errorSummary: '历史可交易性缺失',
    }));
    const handlers = createStrategyActionHandlers({
      name: '',
      schemaText: '{}',
      busyAction: null,
      setBusyAction: vi.fn(),
      toastManager: { add },
      createMutation: { mutateAsync: vi.fn() },
      fetchBarsMutation: { mutateAsync: vi.fn() },
      queueMutation: { mutateAsync: queue },
      runMutation: { mutateAsync: vi.fn() },
      cancelMutation: { mutateAsync: vi.fn() },
      retryMutation: { mutateAsync: vi.fn() },
      load,
    });
    await handlers.startBacktest(
      { id: 'version', version: 1, schema: strategy },
      { ...setup, executionModel: model },
    );
    expect(load).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '回测排队失败',
        description: '请先准备并确认回测配置。',
        type: 'error',
      }),
    );
    expect(add).not.toHaveBeenCalledWith(expect.objectContaining({ title: '回测已排队' }));
  });
});
