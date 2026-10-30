// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiProviderModelCatalogConfig } from '@thesis-ledger/schemas';
import { AiProviderModelCatalogFields } from '../src/features/providers/AiProviderModelCatalogFields.js';
import {
  modelCatalogConfigFromDraft,
  modelCatalogDraftFromConfig,
  modelCatalogInputError,
} from '../src/features/providers/ai-provider-model-catalog.js';
import {
  aiProviderInputFromDraft,
  providerDraftFromRecord,
} from '../src/features/providers/ai-provider.actions.js';
import {
  newAiProviderDraft,
  type ProviderDraft,
} from '../src/features/providers/providers.types.js';
import { aiProvider } from './ai-provider-fixture.js';

const config: AiProviderModelCatalogConfig = {
  url: 'https://example.test/models/search',
  itemsPath: '',
  idPath: '',
  filter: { path: '', equals: 'text-model' },
  pagination: { pageParam: 'page', pageSize: 100, startPage: 0, stopWhen: 'empty-page' },
};
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe('通用目录配置表单', () => {
  it('仅呈现通用规则，默认不带来源预设或隐藏手动地址', () => {
    const markup = renderToStaticMarkup(
      <AiProviderModelCatalogFields draft={newAiProviderDraft()} onUpdateDraft={() => undefined} />,
    );
    expect(markup).toContain('默认规则');
    expect(markup).toContain('手动配置');
    expect(markup).not.toContain('id="ai-catalog-url"');
    expect(markup).not.toMatch(/cloudflare|openrouter|bigmodel/iu);
  });

  it('手动模式回显请求、映射、筛选和分页，选项文字均为中文', () => {
    const draft = { ...newAiProviderDraft(), modelCatalog: modelCatalogDraftFromConfig(config) };
    const markup = renderToStaticMarkup(
      <AiProviderModelCatalogFields draft={draft} onUpdateDraft={() => undefined} />,
    );
    const element = document.createElement('div');
    element.innerHTML = markup;
    expect(element.querySelector<HTMLInputElement>('[aria-label="目录请求地址"]')?.value).toBe(
      config.url,
    );
    expect(element.querySelector<HTMLInputElement>('[aria-label="响应列表路径"]')?.value).toBe('');
    expect(element.querySelector<HTMLInputElement>('[aria-label="目录起始页"]')?.value).toBe('0');
    expect(element.textContent).toContain('返回空页时结束');
    expect(element.textContent).not.toMatch(/empty-page|short-page/u);
  });

  it('用户可切换手动规则和默认规则，切换本身不保存', async () => {
    let current: ProviderDraft = newAiProviderDraft();
    const saved = vi.fn();
    function Harness() {
      const [draft, setDraft] = useState(current);
      current = draft;
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            saved(draft);
          }}
        >
          <AiProviderModelCatalogFields draft={draft} onUpdateDraft={setDraft} />
        </form>
      );
    }
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<Harness />));
    const choose = async (text: string) => {
      const button = [...host!.querySelectorAll('button')].find(
        (item) => item.textContent === text,
      );
      expect(button).toBeDefined();
      await act(async () => button!.click());
    };
    await choose('手动配置');
    expect(host.querySelector('[aria-label="目录请求地址"]')).not.toBeNull();
    expect(current.modelCatalog?.url).toBe('');
    await choose('默认规则');
    expect(current.modelCatalog).toBeNull();
    expect(host.querySelector('[aria-label="目录请求地址"]')).toBeNull();
    expect(saved).not.toHaveBeenCalled();
  });

  it('往返保留根路径、可选参数和规则值，不将默认规则误当清除', () => {
    expect(modelCatalogConfigFromDraft(modelCatalogDraftFromConfig(config))).toEqual(config);
    expect(modelCatalogConfigFromDraft(undefined)).toBeUndefined();
    expect(modelCatalogConfigFromDraft(null)).toBeNull();
    const draft = providerDraftFromRecord(
      aiProvider({ baseUrl: 'https://example.test/v1', modelCatalog: config }),
    );
    expect(aiProviderInputFromDraft(draft).modelCatalog).toEqual(config);
  });

  it('规则错误有明确中文反馈，认证地址的来源边界在前端校验', () => {
    expect(
      modelCatalogInputError({
        baseUrl: 'https://example.test/v1',
        authMode: 'api_key',
        modelCatalog: { ...config, idPath: 'invalid' },
      }),
    ).toContain('JSON Pointer');
    expect(
      modelCatalogInputError({
        baseUrl: 'https://other.test/v1',
        authMode: 'api_key',
        modelCatalog: config,
      }),
    ).toContain('同源');
    expect(
      modelCatalogInputError({
        baseUrl: 'https://example.test/v1',
        authMode: 'none',
        modelCatalog: { ...config, pagination: { ...config.pagination!, pageSize: 0 } },
      }),
    ).toContain('1 到 2000');
  });
});
