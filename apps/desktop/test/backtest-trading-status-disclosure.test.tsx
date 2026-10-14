import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BacktestTradingStatusDisclosure } from '../src/features/strategy/BacktestTradingStatusDisclosure.js';
import { BacktestRunDisclosure } from '../src/features/strategy/BacktestModelDisclosure.js';
import { StrategyBacktestDiagnostics } from '../src/features/strategy/StrategyBacktestDiagnostics.js';
import {
  buildBacktestDiagnosticExport,
  buildBacktestDiagnosticSummary,
} from '../src/features/strategy/strategy-backtest-diagnostics.model.js';
import type { BacktestJob, BacktestJobResult } from '../src/features/strategy/strategy.types.js';
import { formatDateOnly } from '../src/lib/date-display.js';

const sample = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/schemas/fixtures/market-trading-status-v3.response.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const disclosure = { status: 'source', response: sample.response };
const job: BacktestJob = {
  id: 'status-job',
  strategyVersionId: 'version-status',
  mode: 'V3',
  status: 'succeeded',
};
const result = (value: unknown = disclosure): BacktestJobResult => ({
  schemaVersion: '3',
  completeness: 'partial',
  tradingStatusDisclosure: value,
  benchmarkCompatibility: {
    status: 'compatible',
    costAssumption: {
      kind: 'execution-model',
      version: 'execution-model-cost-v1',
      fingerprint: '0123456789abcdef',
    },
  },
});

describe('冻结停复牌结果消费', () => {
  it('显示公告已知日期、未知范围、公开来源与冻结版本，日期使用统一格式', () => {
    const html = renderToStaticMarkup(<BacktestTradingStatusDisclosure disclosure={disclosure} />);
    expect(html).toContain('停复牌：已使用冻结公告');
    expect(html).toContain('000995.SZ');
    expect(html).toContain(`公告披露停牌：${formatDateOnly('2023-08-17')}`);
    expect(html).toContain(`公告披露可交易：${formatDateOnly('2023-08-18')}`);
    expect(html).toContain(`未知：${formatDateOnly('2023-08-16')}`);
    expect(html).toContain(
      `未知：${formatDateOnly('2023-08-19')} 至 ${formatDateOnly('2023-08-21')}`,
    );
    expect(html).toContain('上市公司公告');
    expect(html).toContain(`href="${sample.response.sourceDocuments[0].url}"`);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(sample.response.provenance.providerRevision);
    expect(html).toContain('历史首次可见时间尚未核验');
    expect(html).not.toContain('已确认正常');
  });

  it('全窗未知合并展示，不从公告链接或周末推断正常', () => {
    const value = structuredClone(disclosure);
    value.response.days = value.response.days.map((day: { date: string }) => ({
      date: day.date,
      state: 'unknown',
    }));
    const html = renderToStaticMarkup(<BacktestTradingStatusDisclosure disclosure={value} />);
    expect(html).toContain(
      `未知：${formatDateOnly('2023-08-16')} 至 ${formatDateOnly('2023-08-21')}`,
    );
    expect(html).not.toContain('公告披露停牌：');
    expect(html).not.toContain('公告披露可交易：');
    expect(html).toContain('未知日期沿用本次研究假设');
  });

  it('显示整窗回退和未纳入原因', () => {
    const html = renderToStaticMarkup(
      <BacktestTradingStatusDisclosure
        disclosure={{ ...disclosure, fallbackReason: '主源不可用，整窗使用已配置备用源。' }}
      />,
    );
    expect(html).toContain('整窗使用已配置备用源');
    const missing = renderToStaticMarkup(
      <BacktestTradingStatusDisclosure
        disclosure={{ status: 'notIncluded', reason: '未配置状态来源，未纳入真实状态约束。' }}
      />,
    );
    expect(missing).toContain('停复牌：未纳入真实状态约束');
    expect(missing).toContain('未配置状态来源');
    expect(missing).not.toContain('已使用冻结公告');
  });

  it('无字段或无效合同不生成状态声明', () => {
    for (const value of [
      undefined,
      null,
      { status: 'notIncluded' },
      { ...disclosure, response: { ...sample.response, days: [] } },
    ])
      expect(renderToStaticMarkup(<BacktestTradingStatusDisclosure disclosure={value} />)).toBe('');
  });

  it('结果页只挂接 V3 的实际状态披露，旧结果保持缺省', () => {
    const markup = renderToStaticMarkup(
      <BacktestRunDisclosure job={{ ...job, result: result() }} />,
    );
    expect(markup).toContain('停复牌：已使用冻结公告');
    expect(markup).toContain('结果完整度：部分完整');
    for (const value of [{ schemaVersion: '3' }, { ...result(), schemaVersion: '2' }]) {
      const old = renderToStaticMarkup(<BacktestRunDisclosure job={{ ...job, result: value }} />);
      expect(old).not.toContain('停复牌：');
    }
  });

  it('非公开网页协议不创建来源链接', () => {
    const value = structuredClone(disclosure);
    value.response.sourceDocuments[0].url = 'javascript:alert(1)';
    const html = renderToStaticMarkup(<BacktestTradingStatusDisclosure disclosure={value} />);
    expect(html).toContain(sample.response.sourceDocuments[0].title);
    expect(html).not.toContain('href=');
  });

  it('诊断白名单保存逐日状态、来源引用及版本，不导出路由或 Provider 配置', () => {
    const exported = buildBacktestDiagnosticExport(job, result());
    expect(exported.formatVersion).toBe(2);
    expect(exported.outcome.tradingStatus).toMatchObject({
      status: 'source',
      days: sample.response.days,
      provenance: sample.response.provenance,
    });
    const text = JSON.stringify(exported.outcome.tradingStatus);
    expect(text).not.toContain('routeTarget');
    expect(text).not.toContain('requestId');
    expect(text).not.toContain('routeKey');
    expect(exported.outcome.benchmarkCompatibility.costAssumption).toMatchObject({
      kind: 'execution-model',
      version: 'execution-model-cost-v1',
      fingerprint: '0123456789abcdef',
    });
    expect(buildBacktestDiagnosticSummary(exported)).toContain('停复牌来源与状态');
    const html = renderToStaticMarkup(<StrategyBacktestDiagnostics job={job} result={result()} />);
    expect(html).toContain('停复牌来源与状态');
  });

  it('诊断对来源文本、回退原因及带凭证链接沿用既有脱敏', () => {
    const value = structuredClone(disclosure);
    value.response.sourceDocuments[0].title = '公告 password=document-secret';
    value.response.sourceDocuments[0].url =
      'https://user:pass@example.com/doc?access_token=url-secret';
    const exported = buildBacktestDiagnosticExport(
      job,
      result({ ...value, fallbackReason: '主源失败 cookie=fallback-secret' }),
    );
    const text = JSON.stringify(exported);
    for (const secret of ['document-secret', 'url-secret', 'user:pass', 'fallback-secret'])
      expect(text).not.toContain(secret);
    expect(text).toContain('[已脱敏]');
    expect(text).toContain('[已移除带凭证的 URL]');
    const absent = buildBacktestDiagnosticExport(
      job,
      result({ status: 'notIncluded', reason: '源不可用 api_key=reason-secret' }),
    );
    expect(JSON.stringify(absent)).not.toContain('reason-secret');
    expect(absent.outcome.tradingStatus).toMatchObject({
      status: 'notIncluded',
      reason: '源不可用 api_key=[已脱敏]',
    });
  });

  it('旧诊断不添加字段、摘要或页面声明，非法来源不序列化', () => {
    for (const value of [{ schemaVersion: '3' }, { ...result(), schemaVersion: '2' }]) {
      const exported = buildBacktestDiagnosticExport(job, value);
      expect(exported.outcome).not.toHaveProperty('tradingStatus');
      expect(buildBacktestDiagnosticSummary(exported)).not.toContain('停复牌来源与状态');
      expect(
        renderToStaticMarkup(<StrategyBacktestDiagnostics job={job} result={value} />),
      ).not.toContain('停复牌来源与状态');
    }
    const value = {
      ...disclosure,
      response: { ...sample.response, providerConfig: { apiKey: 'must-not-export' } },
    };
    expect(JSON.stringify(buildBacktestDiagnosticExport(job, result(value)))).not.toContain(
      'must-not-export',
    );
  });
});
