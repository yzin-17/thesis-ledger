// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuleSourceMonitorPanel } from './RuleSourceMonitorPanel.js';
import type { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import {
  ruleMonitorStatusSchema,
  ruleMonitorCheckSchema,
  ruleMonitorJobResponseSchema,
  ruleMonitorVersionsSchema,
} from '@thesis-ledger/schemas';

type Api = ThesisLedgerApiClient['market'];

const api = vi.hoisted(() => ({
  getRuleMonitor: vi.fn<Api['getRuleMonitor']>(),
  configureRuleMonitor: vi.fn<Api['configureRuleMonitor']>(),
  checkRuleSources: vi.fn<Api['checkRuleSources']>(),
  getRuleMonitorVersions: vi.fn<Api['getRuleMonitorVersions']>(),
}));
vi.mock('../../shared/api/client.js', () => ({ getDesktopApiClient: () => ({ market: api }) }));
const fixture = () => {
  const raw = JSON.parse(
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../../packages/schemas/fixtures/rule-source-monitor-v1.json',
      ),
      'utf8',
    ),
  ) as {
    status: unknown;
    changedStatus: unknown;
    queued: unknown;
    request: unknown;
    versions: unknown;
  };
  return {
    status: ruleMonitorStatusSchema.parse(raw.status),
    changedStatus: ruleMonitorStatusSchema.parse(raw.changedStatus),
    queued: ruleMonitorJobResponseSchema.parse(raw.queued),
    request: ruleMonitorCheckSchema.parse(raw.request),
    versions: ruleMonitorVersionsSchema.parse(raw.versions),
  };
};
const interact = async (work: () => void) =>
  act(async () => {
    work();
    await Promise.resolve();
  });

describe('收费资料监测页面的显式操作', () => {
  let root: Root;
  let host: HTMLDivElement;
  let client: QueryClient;
  let sample: ReturnType<typeof fixture>;
  let status: ReturnType<typeof fixture>['status'];
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    sample = fixture();
    status = sample.status;
    for (const method of Object.values(api)) method.mockReset();
    api.getRuleMonitor.mockImplementation(() => Promise.resolve(status));
    api.configureRuleMonitor.mockImplementation((input) => {
      status = {
        ...status,
        config: {
          revision: input.expectedRevision + 1,
          enabled: input.enabled,
          sourceIds: input.sourceIds,
        },
      };
      return Promise.resolve({ version: status.version, config: status.config });
    });
    api.checkRuleSources.mockImplementation((input) => {
      const run = { ...sample.queued.run, id: input.requestId, sourceIds: input.sourceIds };
      status = { ...status, latestRun: run };
      return Promise.resolve({ version: status.version, run });
    });
    api.getRuleMonitorVersions.mockImplementation((kind, identity) =>
      Promise.resolve({
        ...sample.versions,
        kind,
        identity,
      }),
    );
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await interact(() => root.unmount());
    client.clear();
    host.remove();
    vi.unstubAllGlobals();
  });
  const render = () =>
    interact(() =>
      root.render(
        <QueryClientProvider client={client}>
          <RuleSourceMonitorPanel />
        </QueryClientProvider>,
      ),
    );
  const button = (label: string) =>
    [...host.querySelectorAll('button')].find((value) => value.textContent === label);
  const click = async (label: string) => {
    expect(button(label)).toBeDefined();
    await interact(() => button(label)!.click());
  };
  const wait = (assertion: () => void) =>
    vi.waitFor(async () => {
      await interact(() => {});
      assertion();
    });
  const select = async () => {
    await wait(() => expect(host.textContent).toContain('港股扩展公共收费'));
    const source = [...host.querySelectorAll('[aria-label="选择监测来源"] button')].find((value) =>
      value.textContent?.includes('港股扩展公共收费'),
    );
    await interact(() => (source as HTMLButtonElement).click());
  };

  it('首次打开仅查询状态，来源和定期开关需明确保存，开启无来源不能保存', async () => {
    await render();
    await wait(() => expect(button('定期检查：关闭')).toBeDefined());
    expect(api.checkRuleSources).not.toHaveBeenCalled();
    expect(api.configureRuleMonitor).not.toHaveBeenCalled();
    await click('定期检查：关闭');
    expect(button('保存监测配置')!.disabled).toBe(true);
    await select();
    await click('保存监测配置');
    await wait(() => expect(api.configureRuleMonitor).toHaveBeenCalledOnce());
    expect(api.configureRuleMonitor.mock.calls[0]![0]).toMatchObject({
      expectedRevision: 0,
      enabled: true,
      sourceIds: ['official-hk-rules/hk-stock-public-fees'],
    });
    expect(api.checkRuleSources).not.toHaveBeenCalled();
  });
  it('响应未确认时显式重试沿用同一请求，不能重新创建一次外部检查', async () => {
    api.checkRuleSources.mockRejectedValueOnce(new Error('controlled-transport-unknown'));
    await render();
    await select();
    await click('手动检查');
    await wait(() => expect(host.textContent).toContain('检查结果暂未确认'));
    const first = api.checkRuleSources.mock.calls[0]![0];
    await click('手动检查');
    await wait(() => expect(api.checkRuleSources).toHaveBeenCalledTimes(2));
    expect(api.checkRuleSources.mock.calls[1]![0].requestId).toBe(first.requestId);
    await wait(() => expect(host.textContent).toContain('等待检查'));
    expect(button('手动检查')!.disabled).toBe(true);
  });
  it('部分失败保留成功观察与版本记录，读取版本不会再次发起检查', async () => {
    status = sample.changedStatus;
    if (!status.latestRun || !status.observations[0]) throw new Error('受控夹具缺少任务或观察记录');
    status.latestRun.status = 'partial';
    status.latestRun.counts.unavailable = 1;
    status.observations[0].status = 'unavailable';
    status.observations[0].errorCode = 'document_unavailable';
    await render();
    await wait(() => expect(host.textContent).toContain('最后成功摘要已保留'));
    expect(host.textContent).toContain('暂不可读');
    await click('2个版本');
    await wait(() =>
      expect(host.querySelector('[aria-label="资料版本记录"]')?.textContent).toContain('首次观察'),
    );
    expect(api.getRuleMonitorVersions).toHaveBeenCalledOnce();
    expect(api.checkRuleSources).not.toHaveBeenCalled();
  });
  it('状态查询失败明确不可用，不展示成任务缺失或自动检查', async () => {
    api.getRuleMonitor.mockRejectedValue(new Error('controlled-database-unavailable'));
    await render();
    await wait(() => expect(host.textContent).toContain('监测状态暂时无法读取'));
    expect(host.textContent).not.toContain('未找到');
    expect(api.checkRuleSources).not.toHaveBeenCalled();
  });
});
