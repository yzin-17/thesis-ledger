import { readFileSync } from 'node:fs';
// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { ToastProvider } from '../src/components/ui/toast.js';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { NavigationGuardProvider } from '../src/features/shared/navigation-guard.js';
import {
  PortfolioModeProvider,
  usePortfolioMode,
} from '../src/features/portfolio/portfolio-mode-context.js';
import { ResearchSubmissionSheet } from '../src/features/ai/ResearchSubmissionSheet.js';
import type { AiRoutingSettings } from '../src/features/ai/ai.types.js';
import {
  createResearchBrowserApi,
  type ResearchBrowserScenario,
  type ResearchBrowserExamples,
} from './research-workbench-browser-data.js';

const sample = JSON.parse(
  readFileSync('../../packages/schemas/fixtures/research-v2.samples.json', 'utf8'),
) as ResearchBrowserExamples;
const stub = vi.hoisted(() => ({ client: null as unknown, created: vi.fn() }));
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => stub.client }));
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let router: ReturnType<typeof createMemoryRouter>;
let controlled: ReturnType<typeof createResearchBrowserApi>;
let requestMode: () => Promise<boolean>;
function Form() {
  const [open, setOpen] = useState(true);
  const mode = usePortfolioMode();
  requestMode = () => mode.changeMode('actual');
  return (
    <>
      <output aria-label="当前模式">{mode.mode}</output>
      <ResearchSubmissionSheet
        open={open}
        onOpenChange={setOpen}
        onCreated={(value) => {
          stub.created(value);
          setOpen(false);
        }}
      />
    </>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.setItem('thesis-ledger-portfolio-mode', 'shadow');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  client?.clear();
  router?.dispose();
  host?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});
type ModelSettingsControl = {
  current: AiRoutingSettings;
  patches: Array<{
    researchDefault: AiRoutingSettings['researchDefault'];
    expectedRevision: string;
  }>;
  failure?: string;
  readFailure?: boolean;
  waitForSave?: Promise<void>;
};
function modelSettings(): ModelSettingsControl {
  return {
    current: {
      revision: 'settings-0',
      researchDefault: { providerId: 'local', model: 'local-model' },
      candidates: ['local', 'cloud'].map((name) => ({
        providerId: name,
        providerName: name,
        model: `${name}-model`,
        enabled: true,
        health: 'healthy',
        authMode: 'none' as const,
        priceConfigured: true,
      })),
    },
    patches: [],
  };
}
async function mount(
  scenario: ResearchBrowserScenario = 'normal',
  settings?: ModelSettingsControl,
) {
  controlled = createResearchBrowserApi(scenario, sample);
  const fetcher: typeof fetch = async (input, init) => {
    if (!settings || new URL(String(input)).pathname !== '/api/v1/ai/settings')
      return controlled.fetcher(input, init);
    if (settings.readFailure && init?.method !== 'PATCH')
      return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
    if (init?.method === 'PATCH') {
      const patch = JSON.parse(String(init.body));
      settings.patches.push(patch);
      await settings.waitForSave;
      if (settings.failure)
        return new Response(
          JSON.stringify({ error: 'settings_revision_conflict', message: settings.failure }),
          {
            status: 409,
            headers: { 'content-type': 'application/json' },
          },
        );
      settings.current = {
        ...settings.current,
        revision: 'settings-1',
        researchDefault: patch.researchDefault,
      };
    }
    return new Response(JSON.stringify(settings.current), {
      headers: { 'content-type': 'application/json' },
    });
  };
  stub.client = new ThesisLedgerApiClient('http://controlled.invalid/api/v1', fetcher);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  router = createMemoryRouter([
    {
      path: '*',
      element: (
        <QueryClientProvider client={client}>
          <ToastProvider>
            <ConfirmDialogProvider>
              <NavigationGuardProvider>
                <PortfolioModeProvider>
                  <Form />
                </PortfolioModeProvider>
              </NavigationGuardProvider>
            </ConfirmDialogProvider>
          </ToastProvider>
        </QueryClientProvider>
      ),
    },
  ]);
  await act(async () => root.render(<RouterProvider router={router} />));
  await wait(() => expect(button('独立标的')).toBeTruthy());
}
const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const wait = (assertion: () => void) =>
  vi.waitFor(
    async () => {
      await tick();
      assertion();
    },
    { timeout: 2500 },
  );
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === text,
  );
async function click(text: string) {
  const target = button(text);
  expect(target).toBeTruthy();
  await act(async () => target?.click());
}
async function type(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  expect(input).toBeTruthy();
  if (!input) throw new Error('受控输入不存在');
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }),
    );
  });
}
async function select(label: string, text: string) {
  const trigger = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(trigger).toBeTruthy();
  await act(async () => trigger?.click());
  await wait(() =>
    expect(
      [...document.querySelectorAll<HTMLElement>('[role="option"]')].some((item) =>
        item.textContent?.includes(text),
      ),
    ).toBe(true),
  );
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
    item.textContent?.includes(text),
  );
  await act(async () => option?.click());
}
async function chooseModel(text: string) {
  await act(async () => document.getElementById('ai-research-default')?.click());
  await wait(() =>
    expect(
      [...document.querySelectorAll('[role="option"]')].some(
        (option) => option.textContent === text,
      ),
    ).toBe(true),
  );
  await act(async () => {
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (item) => item.textContent === text,
    );
    option?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    option?.click();
  });
  await wait(() =>
    expect(document.getElementById('ai-research-default')?.textContent).toContain(text),
  );
}
async function prepareModelForm(
  settings: ModelSettingsControl,
  scenario: ResearchBrowserScenario = 'normal',
) {
  await mount(scenario, settings);
  await click('全组合');
  await type('textarea', '请核对这个组合的风险。');
  await wait(() => expect(button('准备并提交研究')?.disabled).toBe(false));
}
it('新建研究内保存模型后，使用新修订提交；未保存和保存中均禁止提交', async () => {
  const settings = modelSettings();
  let release!: () => void;
  settings.waitForSave = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prepareModelForm(settings);
  await chooseModel('cloud / cloud-model');
  expect(button('准备并提交研究')?.disabled).toBe(true);
  expect(settings.patches).toEqual([]);
  await click('保存默认模型');
  await wait(() => expect(settings.patches).toHaveLength(1));
  expect(document.querySelector<HTMLButtonElement>('#ai-research-default')?.disabled).toBe(true);
  expect(button('准备并提交研究')?.disabled).toBe(true);
  await click('关闭');
  expect(document.getElementById('ai-research-default')).not.toBeNull();
  await act(async () => release());
  await wait(() => expect(button('准备并提交研究')?.disabled).toBe(false));
  expect(settings.patches[0]).toEqual({
    researchDefault: { providerId: 'cloud', model: 'cloud-model' },
    expectedRevision: 'settings-0',
  });
  expect(document.getElementById('ai-research-default')?.textContent).toContain(
    'cloud / cloud-model',
  );
  await click('准备并提交研究');
  await wait(() => expect(stub.created).toHaveBeenCalledOnce());
  expect(controlled.latest()?.researchSettingsRevision).toBe('settings-1');
});
it('首次未设置默认时可直接在新建研究内选择并保存', async () => {
  const settings = modelSettings();
  settings.current.researchDefault = null;
  await mount('normal', settings);
  await click('全组合');
  await type('textarea', '首次研究需要明确选择模型。');
  expect(button('准备并提交研究')?.disabled).toBe(true);
  await chooseModel('local / local-model');
  await click('保存默认模型');
  await wait(() => expect(button('准备并提交研究')?.disabled).toBe(false));
  expect(settings.current.researchDefault).toEqual({ providerId: 'local', model: 'local-model' });
  expect(JSON.parse(controlled.stats()).submitAttempts).toBe(0);
});
it('默认读取失败时禁止操作，重新读取可恢复；空候选明确提示配置研究用途', async () => {
  const settings = modelSettings();
  settings.readFailure = true;
  settings.current.researchDefault = null;
  settings.current.candidates = [];
  await mount('normal', settings);
  await wait(() => expect(document.body.textContent).toContain('研究默认模型读取失败'));
  expect(document.querySelector<HTMLButtonElement>('#ai-research-default')?.disabled).toBe(true);
  expect(button('准备并提交研究')?.disabled).toBe(true);
  settings.readFailure = false;
  await click('重新读取模型');
  await wait(() =>
    expect(document.querySelector<HTMLButtonElement>('#ai-research-default')?.disabled).toBe(false),
  );
  expect(document.body.textContent).toContain('暂无可选模型');
  expect(document.body.textContent).toContain('“研究报告”用途');
  expect(settings.patches).toEqual([]);
});
it('保存冲突保留问题及待保存选择，重新读取后可恢复', async () => {
  const settings = modelSettings();
  settings.failure = '默认设置已变化，请重新读取后确认。';
  await prepareModelForm(settings);
  await chooseModel('cloud / cloud-model');
  await click('保存默认模型');
  await wait(() => expect(document.body.textContent).toContain(settings.failure));
  expect(button('准备并提交研究')?.disabled).toBe(true);
  expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(
    '请核对这个组合的风险。',
  );
  expect(JSON.parse(controlled.stats()).submitAttempts).toBe(0);
  settings.current.revision = 'external-1';
  await click('重新读取模型');
  await wait(() => expect(button('准备并提交研究')?.disabled).toBe(false));
  expect(document.getElementById('ai-research-default')?.textContent).toContain(
    'local / local-model',
  );
  expect(document.body.textContent).not.toContain(settings.failure);
});
it('清除默认需明确保存，清除后禁止创建', async () => {
  const settings = modelSettings();
  await prepareModelForm(settings);
  await click('清除默认');
  expect(settings.current.researchDefault).not.toBeNull();
  expect(button('准备并提交研究')?.disabled).toBe(true);
  await click('保存默认模型');
  await wait(() => expect(settings.current.researchDefault).toBeNull());
  await wait(() => expect(button('保存默认模型')?.disabled).toBe(true));
  expect(button('准备并提交研究')?.disabled).toBe(true);
  expect(JSON.parse(controlled.stats()).submitAttempts).toBe(0);
});
it('只修改模型也触发草稿关闭确认，取消关闭保留选择', async () => {
  const settings = modelSettings();
  await mount('normal', settings);
  await chooseModel('cloud / cloud-model');
  await click('关闭');
  await wait(() => expect(document.body.textContent).toContain('放弃未保存的修改？'));
  await click('继续编辑');
  expect(document.getElementById('ai-research-default')?.textContent).toContain(
    'cloud / cloud-model',
  );
  expect(settings.patches).toEqual([]);
});
it('待确认原提交锁定模型配置，避免改写冻结输入', async () => {
  const settings = modelSettings();
  await prepareModelForm(settings, 'lost');
  await click('准备并提交研究');
  await wait(() => expect(button('找回原提交')).toBeTruthy());
  expect(document.querySelector<HTMLButtonElement>('#ai-research-default')?.disabled).toBe(true);
  expect(button('清除默认')?.disabled).toBe(true);
  expect(settings.patches).toEqual([]);
});
it('独立标的使用目录 ID 且不确认资产、不带账户；真正点击后才提交', async () => {
  await mount();
  expect(JSON.parse(controlled.stats()).submitAttempts).toBe(0);
  await type('input[aria-label="研究标的"]', '600519');
  await wait(() => {
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    const input = document.querySelector<HTMLInputElement>('input[aria-label="研究标的"]');
    expect(
      options.some((item) => item.textContent?.includes('受控目录标的')),
      JSON.stringify({
        stats: JSON.parse(controlled.stats()),
        value: input?.value,
        expanded: input?.getAttribute('aria-expanded'),
        options: options.map((item) => item.textContent),
        text: document.body.textContent?.slice(-650),
      }),
    ).toBe(true);
  });
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
    item.textContent?.includes('受控目录标的'),
  );
  await act(async () => option?.click());
  await wait(() =>
    expect(document.querySelector<HTMLInputElement>('input[aria-label="研究标的"]')?.value).toBe(
      '受控目录标的',
    ),
  );
  await type('textarea', '这个标的有哪些资料缺口？');
  await wait(() => expect(button('准备并提交研究')?.disabled).toBe(false));
  await click('准备并提交研究');
  await wait(() => expect(stub.created).toHaveBeenCalledOnce());
  expect(controlled.latest()).toMatchObject({
    version: 2,
    mode: 'shadow',
    scope: { scope: 'instrument' },
  });
  expect(controlled.latest()?.scope).not.toHaveProperty('accountId');
  expect(JSON.parse(controlled.stats()).blocked).toBe(0);
});
it.each(['portfolio', 'account', 'position', 'strategy'] as const)(
  '五范围共用提交合同并保留模拟范围：%s',
  async (scope) => {
    await mount();
    const labels = {
      portfolio: '全组合',
      account: '账户',
      position: '单个持仓',
      strategy: '策略版本',
    };
    await click(labels[scope]);
    if (scope === 'account' || scope === 'position') {
      await wait(() =>
        expect(
          document.querySelector<HTMLButtonElement>('button[aria-label="研究账户"]')?.disabled,
        ).toBe(false),
      );
      await select('研究账户', '受控模拟账户');
    }
    if (scope === 'position') {
      await wait(() =>
        expect(document.querySelector('button[aria-label="研究持仓"]')).toBeTruthy(),
      );
      await select('研究持仓', '600519.SH');
    }
    if (scope === 'strategy') {
      await wait(() =>
        expect(
          document.querySelector<HTMLButtonElement>('button[aria-label="策略版本"]')?.disabled,
        ).toBe(false),
      );
      await select('策略版本', '受控研究策略');
    }
    await type('textarea', '请核对这个范围的风险与未知项。');
    await wait(() => expect(button('准备并提交研究')?.disabled).toBe(false));
    await click('准备并提交研究');
    await wait(() => expect(stub.created).toHaveBeenCalledOnce());
    expect(controlled.latest()).toMatchObject({ mode: 'shadow', scope: { scope } });
    expect(JSON.parse(controlled.stats()).created).toBe(1);
  },
);
it('注册身份不显示共享账本范围', async () => {
  await mount('registered');
  expect(button('账户')).toBeUndefined();
  expect(button('全组合')).toBeUndefined();
  expect(button('策略版本')).toBeTruthy();
  expect(JSON.parse(controlled.stats()).submitAttempts).toBe(0);
});
it('创建未开放时即使已有问题和组合选择也不发送提交', async () => {
  await mount('closed');
  await click('全组合');
  await type('textarea', '受控关闭创建场景');
  expect(button('准备并提交研究')?.disabled).toBe(true);
  expect(JSON.parse(controlled.stats()).submitAttempts).toBe(0);
});
it('全局模式切换可取消并保留草稿；接受切换才关闭当前范围输入', async () => {
  await mount();
  await type('textarea', '尚未提交的研究问题');
  let transition!: Promise<boolean>;
  await act(async () => {
    transition = requestMode();
  });
  await click('继续编辑');
  await expect(transition).resolves.toBe(false);
  expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('尚未提交的研究问题');
  expect(document.querySelector('output')?.textContent).toBe('shadow');
  await act(async () => {
    transition = requestMode();
  });
  await click('放弃修改并切换');
  await expect(transition).resolves.toBe(true);
  expect(document.querySelector('output')?.textContent).toBe('actual');
  expect(JSON.parse(controlled.stats()).submitAttempts).toBe(0);
});
