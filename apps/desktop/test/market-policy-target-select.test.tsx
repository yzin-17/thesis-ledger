// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketPolicyTargetSelect } from '../src/features/market-data/MarketPolicyTargetSelect.js';
import { MarketProviderPanel } from '../src/features/market-data/MarketProviderPanel.js';
import {
  routeKeyIdV3,
  routeKeyLabelV3,
} from '../src/features/market-data/market-data-routes-v3.js';
import { catalog, key, provider, target } from './market-policy-defaults.fixture.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(window, { PointerEvent: MouseEvent });
let root: Root | undefined;
let host: HTMLDivElement | undefined;
const onChange = vi.fn();
const row = { id: routeKeyIdV3(key), key, label: routeKeyLabelV3(key) };

async function render(role: 'primary' | 'fallback', selected = false, missing = true) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MarketPolicyTargetSelect
        row={row}
        role={role}
        selected={selected ? target : undefined}
        other={
          role === 'fallback' ? { providerId: 'tencent', upstreamSource: 'tencent' } : undefined
        }
        catalog={{
          ...catalog,
          entries: [{ key, target, state: missing ? 'credential_missing' : 'ready' }],
        }}
        providers={[{ ...provider, credentialConfigured: !missing }]}
        disabled={false}
        onChange={onChange}
      />,
    );
  });
}

async function open() {
  await act(async () => {
    (host!.querySelector('[role="combobox"]') as HTMLElement).click();
  });
}

async function clickOption(option: HTMLElement) {
  await act(async () => {
    const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(down, 'pointerType', { value: 'mouse' });
    option.dispatchEvent(down);
    option.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1 }));
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.clearAllMocks();
});

describe('数据源启用凭证前置', () => {
  it.each([
    { requiresCredential: true, credentialConfigured: false, blocked: true },
    { requiresCredential: true, credentialConfigured: true, blocked: false },
    { requiresCredential: false, credentialConfigured: false, blocked: false },
  ])('凭证状态 $requiresCredential / $credentialConfigured 控制启用开关', async (state) => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const change = vi.fn();
    const configure = vi.fn();
    await act(async () =>
      root!.render(
        <MarketProviderPanel
          providers={[
            {
              ...provider,
              ...state,
              enabled: false,
              credentialSchema: {
                methods: [
                  { method: 'api_key', fields: [{ name: 'apiKey', required: true, secret: true }] },
                ],
              },
            },
          ]}
          disabled={false}
          busyAction={null}
          onProviderChange={change}
          onConfigure={configure}
          onTest={vi.fn()}
          onRemove={vi.fn()}
        />,
      ),
    );
    const control = host!.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(control.disabled).toBe(state.blocked);
    await act(async () => control.click());
    if (state.blocked) {
      expect(change).not.toHaveBeenCalled();
      expect(host!.textContent).toContain('请先配置凭证');
      const button = [...host!.querySelectorAll('button')].find(
        (item) => item.textContent === '配置凭证',
      )!;
      expect(button.disabled).toBe(false);
      await act(async () => button.click());
      expect(configure).toHaveBeenCalledOnce();
    } else {
      expect(change).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    }
  });
});

describe('主备来源缺凭证禁选', () => {
  it.each(['primary', 'fallback'] as const)(
    '%s 保留缺凭证选项，但点击不能修改配置',
    async (role) => {
      await render(role);
      await open();
      const option = [...document.querySelectorAll('[role="option"]')].find((item) =>
        item.textContent?.includes('HiThink'),
      ) as HTMLElement;
      expect(option).toBeDefined();
      expect(option.getAttribute('aria-disabled')).toBe('true');
      expect(option.textContent).toContain('凭据缺失');
      await clickOption(option);
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it('已保存的缺凭证目标继续回显，并可清空', async () => {
    await render('primary', true);
    expect(host!.textContent).toContain('HiThink');
    expect(host!.textContent).toContain('凭据缺失');
    await open();
    const none = [...document.querySelectorAll('[role="option"]')].find(
      (item) => item.textContent === '未配置',
    ) as HTMLElement;
    await clickOption(none);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('配置凭证后可选来源并提交精确目标', async () => {
    await render('primary', false, false);
    await open();
    const option = [...document.querySelectorAll('[role="option"]')].find((item) =>
      item.textContent?.includes('HiThink'),
    ) as HTMLElement;
    expect(option.getAttribute('aria-disabled')).not.toBe('true');
    await clickOption(option);
    expect(onChange).toHaveBeenCalledWith(target);
  });
});
