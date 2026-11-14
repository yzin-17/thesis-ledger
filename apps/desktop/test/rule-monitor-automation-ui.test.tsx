import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AutomationTable,
  AutomationRunHistoryTable,
} from '../src/features/providers/ProviderSettingsSections.js';
import type {
  AutomationJob,
  AutomationHistoryPage,
} from '../src/features/providers/providers.types.js';

const job: AutomationJob = {
  id: 'rule-source-monitor',
  name: '收费资料更新检查',
  type: 'rule-source-monitor',
  cron: '',
  timezone: 'UTC',
  enabled: null,
  nextRunAt: null,
  managed: true,
  source: 'rule-monitor',
  readError: 'rule_monitor_unavailable',
};
const noop = () => {};

describe('规则监测的统一自动化入口', () => {
  it('系统任务复用启停编辑运行操作，读取未知不显示成停用', () => {
    const html = renderToStaticMarkup(
      <AutomationTable
        loadState="ready"
        jobs={[job]}
        togglingJobId={null}
        runningJobId={null}
        onToggle={noop}
        onEdit={noop}
        onRun={noop}
        onDelete={noop}
        onCreate={noop}
      />,
    );
    expect(html).toContain('收费资料检查');
    expect(html).toContain('读取失败');
    expect(html).toContain('>编辑<');
    expect(html).toContain('>立即运行<');
    expect(html).not.toContain('>删除<');
    expect(html).not.toContain('>停用<');
  });
  it('显示任务名称、尚未开始、部分不可读及该次失败，并明确读取缺口', () => {
    const history: AutomationHistoryPage = {
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
      sourceWarnings: [{ source: 'rule-monitor', code: 'rule_monitor_unavailable' }],
      items: [
        {
          id: 'run',
          jobId: job.id,
          jobName: job.name,
          status: 'partial',
          startedAt: null,
          createdAt: '2026-11-09T00:00:00Z',
          error: '收费通告：资料网站返回错误',
          summary: '自动检查；1份暂不可读',
        },
      ],
    };
    const html = renderToStaticMarkup(
      <AutomationRunHistoryTable
        loadState="ready"
        jobs={[]}
        history={history}
        loading={false}
        onPage={noop}
      />,
    );
    expect(html).toContain(job.name);
    expect(html).toContain('尚未开始');
    expect(html).toContain('部分资料不可读');
    expect(html).toContain('收费通告：资料网站返回错误');
    expect(html).toContain('自动检查；1份暂不可读');
    expect(html).toContain('收费资料检查记录暂时无法读取');
  });
});
