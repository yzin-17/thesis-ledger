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
    title: '开放数据质量问题',
    render: (state: LoadState) => <DataQualityIssuesTable loadState={state} issues={[]} />,
  },
];
describe('只读诊断表状态', () => {
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
