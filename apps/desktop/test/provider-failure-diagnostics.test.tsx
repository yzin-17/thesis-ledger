import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProviderFailureDiagnostics } from '../src/features/providers/ProviderFailureDiagnostics.js';

const page = { page: 1, pageSize: 20, total: 21, totalPages: 2 };
const health = {
  ...page,
  items: [
    {
      provider: 'dsa',
      state: 'degraded',
      errorCode: 'timeout',
      latencyMs: 4000,
      checkedAt: '2026-11-09T01:00:00Z',
      source: 'scheduled',
    },
  ],
};
const automation = {
  ...page,
  items: [
    {
      id: 'run',
      jobId: 'job',
      status: 'unknown_outcome',
      startedAt: '2026-11-09T01:00:00Z',
      error: '租约过期',
    },
  ],
};
function render(state: 'ready' | 'loading' | 'error' | 'stale' | 'empty') {
  const query = (data: unknown) => ({
    data: ['loading', 'error'].includes(state) ? undefined : data,
    isPending: state === 'loading',
    isFetching: state === 'stale',
    isError: ['error', 'stale'].includes(state),
    refetch: vi.fn(),
  });
  return renderToStaticMarkup(
    <ProviderFailureDiagnostics
      health={query(state === 'empty' ? { ...page, total: 0, items: [] } : health) as never}
      automation={query(state === 'empty' ? { ...page, total: 0, items: [] } : automation) as never}
      jobs={[{ id: 'job', name: '受控自动化任务' }] as never}
      onHealthPage={() => {}}
      onAutomationPage={() => {}}
    />,
  );
}

describe('诊断失败事实展示', () => {
  it('显示原始错误码、任务名称和独立的结果待确认语义', () => {
    const html = render('ready');
    expect(html).toContain('timeout');
    expect(html).toContain('受控自动化任务');
    expect(html).toContain('结果待确认');
    expect(html).toContain('租约过期');
    expect(html).toContain('共 21 条');
    expect(html).toContain('来源检查异常分页');
    expect(html).toContain('自动化运行异常分页');
  });
  it('读取失败和加载不能变成成功空态，刷新失败保留已有事实', () => {
    expect(render('loading')).toContain('正在读取');
    expect(render('error')).toContain('读取失败');
    expect(render('error')).not.toContain('暂无');
    expect(render('empty')).toContain('暂无来源检查异常');
    const stale = render('stale');
    expect(stale).toContain('timeout');
    expect(stale).toContain('租约过期');
    expect(stale).toContain('更新失败');
  });
});
