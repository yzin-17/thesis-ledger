// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StrategyEditorSheet } from '../src/features/strategy/StrategyEditorSheet.js';
import { createDefaultStrategySchema } from '../src/features/strategy/strategy.schema.js';
import type { StrategySchema } from '../src/features/strategy/strategy.types.js';
import { AuthoringDefinition } from '../src/features/strategy-authoring/AuthoringDefinition.js';
import { emptyAuthoringContent } from '../src/features/strategy-authoring/use-authoring-draft.js';

let host: HTMLDivElement, root: Root, client: QueryClient;
const saved = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  saved.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});
async function mount(schema: StrategySchema = createDefaultStrategySchema()) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <StrategyEditorSheet
          presentation="page"
          open
          mode="edit"
          version={{ id: 'fixture', version: 1, schema, createdAt: '' }}
          busy={false}
          onSave={saved}
          onOpenChange={() => {}}
        />
      </QueryClientProvider>,
    ),
  );
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent === text);
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
}
async function input(element: HTMLInputElement | HTMLTextAreaElement, text: string) {
  await act(async () => {
    const prototype =
      element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function field(label: string) {
  const element = [...host.querySelectorAll('label')].find((item) => item.textContent === label)!;
  return document.getElementById(element.htmlFor) as HTMLInputElement;
}
function complete(): StrategySchema {
  const schema = createDefaultStrategySchema('可视编辑受控样本');
  schema.executionInstrument = { symbol: '600519.SH', market: 'CN', assetType: 'stock' };
  schema.signalSources = [
    {
      id: 'execution',
      asset: schema.executionInstrument,
      timeframe: '1d',
      priceCoordinate: 'research',
      series: ['open', 'high', 'low', 'close', 'volume'],
    },
    {
      id: 'unused',
      asset: { symbol: 'AAPL.US', market: 'US', assetType: 'stock' },
      timeframe: '60m',
      priceCoordinate: 'actual',
      series: ['close'],
    },
  ];
  schema.entry = {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'execution', field: 'close' },
    right: { type: 'constant', value: '100.000000000000000001' },
  };
  return schema;
}

it('AI 草稿保留旧定义原文，修正为现行定义后要求重新审核', async () => {
  const schema = complete();
  schema.signalSources = schema.signalSources.slice(0, 1);
  schema.schemaVersion = '2';
  schema.signalSources = schema.signalSources.map((source: Record<string, unknown>) => {
    const next = { ...source };
    delete next.priceCoordinate;
    return next;
  });
  const content = { ...emptyAuthoringContent, definitionText: JSON.stringify(schema) };
  const onChange = vi.fn();
  await act(async () =>
    root.render(<AuthoringDefinition content={content} onChange={onChange} disabled={false} />),
  );
  expect(onChange).not.toHaveBeenCalled();
  expect(host.textContent).toContain('定义需要修正');
  const current = complete();
  current.signalSources = current.signalSources.slice(0, 1);
  await input(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="策略定义 JSON"]')!,
    JSON.stringify(current));
  const next = onChange.mock.calls[0]![0];
  expect(JSON.parse(next.definitionText)).toEqual(current);
  expect(next.confirmation).toBeNull();
  expect(content.definitionText).toBe(JSON.stringify(schema));
});

it('历史定义进入表单保持原值，现行定义通过人工编辑后保存', async () => {
  const schema = complete();
  schema.schemaVersion = '2';
  schema.signalSources = schema.signalSources.map((source: Record<string, unknown>) => {
    const rest = { ...source };
    delete rest.priceCoordinate;
    return rest;
  });
  const previous = structuredClone(schema);
  await mount(schema);
  await click('保存为新版本');
  expect(saved).not.toHaveBeenCalled();
  await click('高级 JSON');
  const current = complete();
  await input(host.querySelector<HTMLTextAreaElement>('#strategy-json')!, JSON.stringify(current));
  await click('保存为新版本');
  expect(saved).toHaveBeenCalledExactlyOnceWith(current);
  expect(schema).toEqual(previous);
});

it('普通保存不投影、不删除闲置来源、不改写高精度常量', async () => {
  const schema = complete(),
    before = structuredClone(schema);
  await mount(schema);
  await click('保存为新版本');
  expect(saved).toHaveBeenCalledExactlyOnceWith(schema);
  expect(schema).toEqual(before);
});

it('非法 JSON 阻止切换和提交旧草稿；业务不完整对象允许进入表单且未知字段保留', async () => {
  await mount(complete());
  await click('高级 JSON');
  await input(host.querySelector<HTMLTextAreaElement>('#strategy-json')!, '{ broken');
  await click('常用配置');
  await click('保存为新版本');
  expect(host.querySelector<HTMLTextAreaElement>('#strategy-json')!.value).toBe('{ broken');
  expect(saved).not.toHaveBeenCalled();
  const incomplete = {
    ...complete(),
    entry: { type: 'futureNode', precision: '0.000000000000000001' },
    futureRoot: { keep: true },
  };
  await input(
    host.querySelector<HTMLTextAreaElement>('#strategy-json')!,
    JSON.stringify(incomplete),
  );
  await click('常用配置');
  await input(host.querySelector<HTMLTextAreaElement>('#strategy-description')!, '修复中的草稿');
  await click('高级 JSON');
  expect(JSON.parse(host.querySelector<HTMLTextAreaElement>('#strategy-json')!.value)).toEqual({
    ...incomplete,
    description: '修复中的草稿',
  });
  await click('保存为新版本');
  expect(saved).not.toHaveBeenCalled();
});

it('可视修改嵌套交易计划、原子重命名并阻止删除仍被引用的来源', async () => {
  const schema = complete();
  schema.tradePlan = {
    version: 1,
    evaluation: 'barClose',
    initialStop: { kind: 'entryAtr', sourceId: 'execution', period: 14, multiple: '2' },
    stages: [
      {
        id: 'half',
        trigger: { kind: 'gainPercent', value: '0.005' },
        action: { kind: 'reduce', basis: 'remainingQuantity', fraction: '0.5' },
      },
    ],
  };
  await mount(schema);
  await input(field('来源标识'), 'renamed');
  await input(field('卖出数量比例'), '0.250000000000000001');
  await click('删除信号来源 1');
  expect(host.textContent).toContain('来源仍被引用');
  await click('高级 JSON');
  const next = JSON.parse(host.querySelector<HTMLTextAreaElement>('#strategy-json')!.value);
  expect(next.entry.left.sourceId).toBe('renamed');
  expect(next.tradePlan.initialStop.sourceId).toBe('renamed');
  expect(next.tradePlan.stages[0].action).toEqual({
    kind: 'reduce',
    basis: 'remainingQuantity',
    fraction: '0.250000000000000001',
  });
  await click('保存为新版本');
  expect(saved).toHaveBeenCalledExactlyOnceWith(next);
});
