// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuleMonitorStatus } from '@thesis-ledger/schemas';
import { useRuleMonitorAutomation } from '../src/features/providers/useRuleMonitorAutomation.js';

const sample = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../packages/schemas/fixtures/rule-source-monitor-v1.json',
    ),
    'utf8',
  ),
) as { status: RuleMonitorStatus };

const api = vi.hoisted(() => ({
  getRuleMonitor: vi.fn(),
  configureRuleMonitor: vi.fn(),
  checkRuleSources: vi.fn(),
}));
const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => ({ market: api }) }));
vi.mock('@/components/ui/toast', () => ({ useToastManager: () => toast }));

describe('收费资料检查的任务操作', () => {
  let status: RuleMonitorStatus;
  let controls: ReturnType<typeof useRuleMonitorAutomation>;
  let host: HTMLDivElement, root: Root, client: QueryClient;
  const source = 'official-hk-rules/hk-stock-public-fees';
  function Harness() {
    controls = useRuleMonitorAutomation();
    return null;
  }
  beforeEach(async () => {
    vi.clearAllMocks();
    status = structuredClone(sample.status) as RuleMonitorStatus;
    status.config = {
      ...status.config,
      taskCreated: true,
      revision: 17,
      enabled: false,
      sourceIds: [source],
    };
    status.latestRun = null;
    api.getRuleMonitor.mockImplementation(async () => structuredClone(status));
    api.configureRuleMonitor.mockImplementation(async (input) => ({
      version: status.version,
      config: {
        ...status.config,
        revision: input.expectedRevision + 1,
        enabled: input.enabled,
        sourceIds: input.sourceIds,
      },
    }));
    api.checkRuleSources.mockImplementation(async (input) => ({
      version: status.version,
      run: {
        ...sample.status.latestRun,
        id: input.requestId,
        sourceIds: input.sourceIds,
        status: 'queued',
      },
    }));
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => expect(controls.monitor.status.data).toBeDefined());
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  });

  it('启停读取最新修订与已保存来源，不触发资料检查', async () => {
    status.config.revision = 20;
    await act(async () => controls.act('toggle'));
    expect(api.configureRuleMonitor).toHaveBeenCalledWith({
      version: status.version,
      expectedRevision: 20,
      enabled: true,
      sourceIds: [source],
    });
    expect(api.checkRuleSources).not.toHaveBeenCalled();
  });
  it('立即运行使用已保存来源，响应未确认后重试沿用同一检查', async () => {
    await act(async () => controls.monitor.update({ sourceIds: ['unsaved-source'] }));
    api.checkRuleSources.mockRejectedValueOnce(new Error('controlled-transport-unknown'));
    await act(async () => controls.act('run'));
    await act(async () => controls.act('run'));
    expect(api.checkRuleSources).toHaveBeenCalledTimes(2);
    expect(api.checkRuleSources.mock.calls[0]![0].sourceIds).toEqual([source]);
    expect(api.checkRuleSources.mock.calls[1]![0]).toEqual(api.checkRuleSources.mock.calls[0]![0]);
    expect(api.configureRuleMonitor).not.toHaveBeenCalled();
  });
  it('启停冲突不显示保存成功，也不会执行资料检查', async () => {
    api.configureRuleMonitor.mockRejectedValueOnce(new Error('controlled-revision-conflict'));
    await act(async () => controls.act('toggle'));
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: '保存任务失败', type: 'error' }),
    );
    expect(api.checkRuleSources).not.toHaveBeenCalled();
  });
  it('启停成功使任务列表和历史重新读取', async () => {
    const invalidated = vi.spyOn(client, 'invalidateQueries');
    await act(async () => controls.act('toggle'));
    expect(invalidated).toHaveBeenCalledWith({ queryKey: ['desktop', 'providers', 'automations'] });
    expect(invalidated).toHaveBeenCalledWith({
      queryKey: ['desktop', 'providers', 'automation-history'],
    });
    expect(api.checkRuleSources).not.toHaveBeenCalled();
  });
  it('没有来源时引导规则页创建；状态读取失败不发起写入', async () => {
    status.config.sourceIds = [];
    await act(async () => controls.act('run'));
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: '请在规则检测页选择来源并创建任务' }),
    );
    expect(api.checkRuleSources).not.toHaveBeenCalled();
    api.getRuleMonitor.mockRejectedValue(new Error('controlled-unavailable'));
    await act(async () => controls.act('toggle'));
    expect(api.configureRuleMonitor).not.toHaveBeenCalled();
  });
  it('相同事件周期重复点击只提交一次，并沿用原任务操作分派', async () => {
    await act(async () => {
      await Promise.all([controls.act('run'), controls.act('run')]);
    });
    expect(api.checkRuleSources).toHaveBeenCalledOnce();
    const fallback = vi.fn();
    controls.handleAction({ id: 'local', source: 'server' } as never, 'run', fallback);
    expect(fallback).toHaveBeenCalledOnce();
  });
});
