import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DataQualityIssuesTable,
  HealthHistoryTable,
  NotificationFailuresTable,
} from '../src/features/providers/ProviderSettingsSections.js';
import type { LoadState } from '../src/features/shared/types.js';

const tables = [
  {
    title: 'Provider 健康历史',
    render: (state: LoadState) => (
      <HealthHistoryTable
        loadState={state}
        history={{ items: [], page: 2, pageSize: 20, total: 0, totalPages: 0 }}
        loading={false}
        onPage={() => {}}
      />
    ),
  },
  {
    title: '通知失败',
    render: (state: LoadState) => (
      <NotificationFailuresTable loadState={state} notificationFailures={[]} />
    ),
  },
  {
    title: '未关闭的数据质量问题',
    render: (state: LoadState) => <DataQualityIssuesTable loadState={state} issues={[]} />,
  },
];
describe('只读诊断表状态', () => {
  it('自动质量日志显示最近发生时间和合并次数，兼容旧记录的发现时间', () => {
    const detectedAt = '2026-11-09T01:00:00Z';
    const lastSeenAt = '2026-11-09T02:00:00Z';
    const issue = {
      id: 'quality',
      provider: 'dsa',
      symbol: '600519.SH',
      severity: 'error',
      code: 'response_schema_invalid',
      status: 'open',
      detectedAt,
    };
    const html = renderToStaticMarkup(
      <DataQualityIssuesTable
        loadState="ready"
        issues={[
          {
            ...issue,
            details: { occurrences: 3, lastSeenAt, message: '来源返回的数据格式或数值未通过校验' },
          },
        ]}
      />,
    );
    expect(html).toContain('未关闭的数据质量问题');
    expect(html).toContain('数据格式异常');
    expect(html).toContain(new Date(lastSeenAt).toLocaleString('zh-CN'));
    expect(html).toContain('>3</td>');
    const legacy = renderToStaticMarkup(
      <DataQualityIssuesTable loadState="ready" issues={[issue]} />,
    );
    expect(legacy).toContain(new Date(detectedAt).toLocaleString('zh-CN'));
    expect(legacy).toContain('>1</td>');
  });
  it.each(tables)('$title 加载和失败不能表示没有记录', ({ render }) => {
    const loading = renderToStaticMarkup(render('loading'));
    const error = renderToStaticMarkup(render('error'));
    const stale = renderToStaticMarkup(render('stale'));
    const empty = renderToStaticMarkup(render('empty'));
    expect(loading).toContain('正在读取');
    expect(loading).not.toContain('暂无');
    expect(error).toContain('读取失败');
    expect(error).not.toContain('暂无');
    expect(stale).toContain('更新失败');
    expect(empty).toContain('暂无');
  });
});
