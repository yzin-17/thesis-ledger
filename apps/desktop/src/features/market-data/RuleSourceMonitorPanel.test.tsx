// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
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
  createRuleMonitorTask: vi.fn<Api['createRuleMonitorTask']>(),
  checkRuleSources: vi.fn<Api['checkRuleSources']>(),
  getRuleMonitorVersions: vi.fn<Api['getRuleMonitorVersions']>(),
  getRuleMonitorVersion: vi.fn<Api['getRuleMonitorVersion']>(),
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
const button = (label: string) =>
  [...document.querySelectorAll('button')].find((value) => value.textContent === label);
const click = async (label: string) => {
  expect(button(label)).toBeDefined();
  await interact(() => button(label)!.click());
};
const wait = (assertion: () => void) =>
  vi.waitFor(async () => {
    await interact(() => {});
    assertion();
  });

describe('收费资料监测页面的显式操作', () => {
  const suiteScope = ruleMonitorTestContext();
  registerRuleMonitorTaskCases(suiteScope);
  registerRuleMonitorRecoveryCases(suiteScope);
  registerRuleMonitorVersionCases(suiteScope);
});

function ruleMonitorTestContext() {
  let root: Root;
  let host: HTMLDivElement;
  let client: QueryClient;
  let sample: ReturnType<typeof fixture>;
  let status: ReturnType<typeof fixture>['status'];
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('PointerEvent', MouseEvent);
    sample = fixture();
    status = sample.status;
    for (const method of Object.values(api)) method.mockReset();
    api.getRuleMonitor.mockImplementation(() => Promise.resolve(status));
    api.configureRuleMonitor.mockImplementation((input) => {
      status = {
        ...status,
        config: {
          ...status.config,
          revision: input.expectedRevision + 1,
          enabled: input.enabled,
          sourceIds: input.sourceIds,
        },
      };
      return Promise.resolve({ version: status.version, config: status.config });
    });
    api.createRuleMonitorTask.mockImplementation((input) => {
      status = {
        ...status,
        config: {
          ...status.config,
          taskCreated: true,
          enabled: status.config.taskCreated ? status.config.enabled : true,
          revision: input.expectedRevision + 1,
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
    api.getRuleMonitorVersion.mockImplementation((input) =>
      Promise.resolve({
        version: status.version,
        kind: input.kind,
        identity: input.identity,
        contentHash: input.contentHash,
        snapshot: {
          status: 'unavailable',
          format: null,
          text: null,
          capturedAt: null,
          reason: 'legacy_missing',
        },
        comparison: input.baseHash
          ? {
              baseHash: input.baseHash,
              status: 'unavailable',
              reason: 'snapshot_unavailable',
              added: 0,
              removed: 0,
              lines: [],
            }
          : null,
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
          <MemoryRouter>
            <RuleSourceMonitorPanel />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    );
  const select = async () => {
    await wait(() =>
      expect(host.querySelector('[role="combobox"][aria-label="选择监测来源"]')).not.toBeNull(),
    );
    const input = host.querySelector<HTMLInputElement>(
      '[role="combobox"][aria-label="选择监测来源"]',
    )!;
    await interact(() => {
      input.focus();
      input.click();
    });
    await wait(() => expect(document.querySelectorAll('[role="option"]')).toHaveLength(9));
    const source = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((row) =>
      row.textContent?.includes('港股扩展公共收费'),
    );
    expect(source).toBeDefined();
    await interact(() => source!.click());
  };
  return {
    get root() {
      return root;
    },
    set root(value: typeof root) {
      root = value;
    },
    get host() {
      return host;
    },
    set host(value: typeof host) {
      host = value;
    },
    get client() {
      return client;
    },
    set client(value: typeof client) {
      client = value;
    },
    get sample() {
      return sample;
    },
    set sample(value: typeof sample) {
      sample = value;
    },
    get status() {
      return status;
    },
    set status(value: typeof status) {
      status = value;
    },
    get render() {
      return render;
    },
    get select() {
      return select;
    },
  };
}
function registerRuleMonitorTaskCases(suiteScope: ReturnType<typeof ruleMonitorTestContext>) {
  it('规则页只按来源创建任务，不提供执行时间或立即检查设置', async () => {
    suiteScope.client.setQueryData(['desktop', 'providers', 'automations'], []);
    await suiteScope.render();
    await wait(() => expect(button('创建任务')).toBeDefined());
    expect(suiteScope.host.querySelector('[role="switch"]')).toBeNull();
    expect(suiteScope.host.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(suiteScope.host.querySelector('[role="combobox"]')?.getAttribute('aria-label')).toBe(
      '选择监测来源',
    );
    expect(button('立即检查')).toBeUndefined();
    expect(api.checkRuleSources).not.toHaveBeenCalled();
    expect(api.configureRuleMonitor).not.toHaveBeenCalled();
    expect(button('创建任务')!.disabled).toBe(true);
    await suiteScope.select();
    await click('创建任务');
    await wait(() => expect(api.createRuleMonitorTask).toHaveBeenCalledOnce());
    expect(api.createRuleMonitorTask.mock.calls[0]![0]).toEqual({
      version: suiteScope.status.version,
      expectedRevision: 0,
      sourceIds: ['official-hk-rules/hk-stock-public-fees'],
    });
    expect(
      suiteScope.client.getQueryState(['desktop', 'providers', 'automations'])?.isInvalidated,
    ).toBe(true);
    expect(api.checkRuleSources).not.toHaveBeenCalled();
  });
  it('勾选范围有明确状态，点击说明标签不切换，可取消勾选', async () => {
    await suiteScope.render();
    await wait(() => expect(suiteScope.host.querySelector('[role="combobox"]')).not.toBeNull());
    const legend = suiteScope.host.querySelector<HTMLElement>('[data-slot="field-legend"]')!;
    await interact(() => legend.click());
    expect(suiteScope.host.querySelector('[role="combobox"]')?.getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(suiteScope.host.querySelectorAll('[data-slot="combobox-chip"]')).toHaveLength(0);
    await suiteScope.select();
    expect(suiteScope.host.querySelectorAll('[data-slot="combobox-chip"]')).toHaveLength(1);
    expect(suiteScope.host.textContent).toContain('已选 1 / 9 项');
    await suiteScope.select();
    expect(suiteScope.host.querySelectorAll('[data-slot="combobox-chip"]')).toHaveLength(0);
    expect(button('创建任务')!.disabled).toBe(true);
    expect(api.configureRuleMonitor).not.toHaveBeenCalled();
    expect(api.checkRuleSources).not.toHaveBeenCalled();
  });
}
function registerRuleMonitorRecoveryCases(suiteScope: ReturnType<typeof ruleMonitorTestContext>) {
  it('创建失败保留所选来源，重试不发起资料检查', async () => {
    api.createRuleMonitorTask.mockRejectedValueOnce(new Error('controlled-transport-unknown'));
    await suiteScope.render();
    await suiteScope.select();
    await click('创建任务');
    await wait(() => expect(suiteScope.host.textContent).toContain('任务保存失败'));
    const first = api.createRuleMonitorTask.mock.calls[0]![0];
    expect(api.configureRuleMonitor).not.toHaveBeenCalled();
    expect(first.sourceIds).toEqual(['official-hk-rules/hk-stock-public-fees']);
    await click('创建任务');
    await wait(() => expect(api.createRuleMonitorTask).toHaveBeenCalledTimes(2));
    expect(api.createRuleMonitorTask.mock.calls[1]![0]).toEqual(first);
    expect(api.checkRuleSources).not.toHaveBeenCalled();
    await wait(() => expect(suiteScope.host.textContent).toContain('任务已创建'));
  });
  it('来源修订冲突后保留勾选，人工再次保存使用新修订', async () => {
    api.createRuleMonitorTask.mockRejectedValueOnce(new Error('controlled-revision-conflict'));
    await suiteScope.render();
    await suiteScope.select();
    await click('创建任务');
    await wait(() => expect(suiteScope.host.textContent).toContain('任务保存失败'));
    suiteScope.status = {
      ...suiteScope.status,
      config: { ...suiteScope.status.config, revision: 3 },
    };
    expect(button('重新读取任务')).toBeUndefined();
    expect(suiteScope.host.querySelectorAll('[data-slot="combobox-chip"]')).toHaveLength(1);
    await click('创建任务');
    await wait(() => expect(api.createRuleMonitorTask).toHaveBeenCalledTimes(2));
    expect(api.createRuleMonitorTask.mock.calls[1]![0]).toMatchObject({
      expectedRevision: 3,
      sourceIds: ['official-hk-rules/hk-stock-public-fees'],
    });
    expect(api.checkRuleSources).not.toHaveBeenCalled();
  });
}
function registerRuleMonitorVersionCases(suiteScope: ReturnType<typeof ruleMonitorTestContext>) {
  it('部分失败保留成功观察与版本记录，读取版本不会再次发起检查', async () => {
    suiteScope.status = suiteScope.sample.changedStatus;
    if (!suiteScope.status.latestRun || !suiteScope.status.observations[0])
      throw new Error('受控夹具缺少任务或观察记录');
    suiteScope.status.latestRun.status = 'partial';
    suiteScope.status.latestRun.counts.unavailable = 1;
    suiteScope.status.observations[0].status = 'unavailable';
    suiteScope.status.observations[0].errorCode = 'document_unavailable';
    await suiteScope.render();
    await wait(() => expect(suiteScope.host.textContent).toContain('最后成功摘要已保留'));
    expect(suiteScope.host.textContent).toContain('暂不可读');
    await click('查看版本（2）');
    await wait(() =>
      expect(document.querySelector('[aria-label="资料版本记录"]')?.textContent).toContain(
        '首次观察',
      ),
    );
    expect(api.getRuleMonitorVersions).toHaveBeenCalledOnce();
    expect(api.checkRuleSources).not.toHaveBeenCalled();
  });
  it('状态查询失败明确不可用，不展示成任务缺失或自动检查', async () => {
    api.getRuleMonitor.mockRejectedValue(new Error('controlled-database-unavailable'));
    await suiteScope.render();
    await wait(() => expect(suiteScope.host.textContent).toContain('监测状态暂时无法读取'));
    expect(suiteScope.host.textContent).not.toContain('未找到');
    expect(api.checkRuleSources).not.toHaveBeenCalled();
  });
  it('版本抽屉读取失败可原位重试，不发起资料检查', async () => {
    api.getRuleMonitorVersions.mockRejectedValueOnce(new Error('controlled-version-unavailable'));
    await suiteScope.render();
    await wait(() => expect(button('查看版本（1）')).toBeDefined());
    await click('查看版本（1）');
    await wait(() => expect(document.body.textContent).toContain('版本记录暂时无法读取'));
    await click('重试读取版本');
    await wait(() =>
      expect(document.querySelector('[aria-label="资料版本记录"]')?.textContent).toContain(
        '首次观察',
      ),
    );
    expect(api.getRuleMonitorVersions).toHaveBeenCalledTimes(2);
    expect(api.getRuleMonitorVersions.mock.calls[1]!.slice(0, 2)).toEqual(
      api.getRuleMonitorVersions.mock.calls[0]!.slice(0, 2),
    );
    expect(api.checkRuleSources).not.toHaveBeenCalled();
  });
  it('版本加载与空记录在抽屉中显示', async () => {
    let finish: ((value: ReturnType<typeof fixture>['versions']) => void) | undefined;
    api.getRuleMonitorVersions.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await suiteScope.render();
    await wait(() => expect(button('查看版本（1）')).toBeDefined());
    await click('查看版本（1）');
    await wait(() =>
      expect(
        document.querySelector('[aria-label="资料版本记录"] [aria-label="正在读取版本记录"]'),
      ).not.toBeNull(),
    );
    await interact(() => finish!({ ...suiteScope.sample.versions, versions: [] }));
    await wait(() =>
      expect(document.querySelector('[aria-label="资料版本记录"]')?.textContent).toContain(
        '尚无版本记录',
      ),
    );
    expect(api.checkRuleSources).not.toHaveBeenCalled();
  });
}
