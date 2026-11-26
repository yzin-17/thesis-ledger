// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { button, click, field, input, mount, setApi, flush } from './mobile-view-harness';
import { StrategyEditorScreen } from '../../src/features/strategy-editor/StrategyEditorScreen';
import { b4Definition, b4Strategy, b4Draft } from './batch4-fixture';
import { AuthoringContentFields } from '../../src/features/strategy-authoring/AuthoringContentFields';
import { validatedDefinition } from '../../src/features/strategy-editor/strategy-editor-state';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));
beforeEach(() => setApi(vi.fn<typeof fetch>().mockImplementation(async () => Response.json([]))));

it('保存本机草稿后重新进入编辑器，读取最新内容而不是首次加载的空缓存', async () => {
  const stored = new Map<string, string>();
  vi.mocked(AsyncStorage.getItem).mockImplementation(async (key) => stored.get(key) ?? null);
  vi.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
    stored.set(key, value);
  });
  function ReenterEditor() {
    const [entry, setEntry] = useState(0);
    return (
      <>
        <button onClick={() => setEntry(entry + 1)}>重新进入编辑器</button>
        <StrategyEditorScreen key={entry} />
      </>
    );
  }
  await mount(<ReenterEditor />);
  await input(field('策略说明'), '重新进入仍保留');
  await click(button('保存本机草稿'));
  expect(stored.size).toBe(1);
  await click(button('重新进入编辑器'));
  await flush();
  expect(field('策略说明'), document.body.textContent ?? '').not.toBeNull();
  expect(field('策略说明').value).toBe('重新进入仍保留');
});

it('移动端 AI 草稿保留输入，人工替换后使用现行定义', async () => {
  const legacy = JSON.stringify({ ...b4Definition, schemaVersion: '2' });
  const content = { ...b4Draft.content, definitionText: legacy };
  const onChange = vi.fn();
  await mount(
    <AuthoringContentFields text={JSON.stringify(content)} onChange={onChange} disabled={false} />,
  );
  expect(onChange).not.toHaveBeenCalled();
  expect(field('草稿策略定义').value).toBe(legacy);
  await input(field('草稿策略定义'), b4Draft.content.definitionText);
  const next = JSON.parse(onChange.mock.calls[0]![0]);
  expect(JSON.parse(next.definitionText)).toMatchObject({
    schemaVersion: 'strategy-definition-v1',
    signalSources: [{ priceCoordinate: 'run' }],
  });
});

it('移动端普通保存保持显式研究阈值、闲置实际来源与精度，不作隐式投影', () => {
  const schema = {
    ...b4Definition,
    schemaVersion: 'strategy-definition-v1',
    signalSources: b4Definition.signalSources.map((source) => ({
      ...source,
      priceCoordinate: 'research',
    })),
    entry: {
      type: 'compare',
      operator: 'gt',
      left: { type: 'series', sourceId: b4Definition.signalSources[0]!.id, field: 'close' },
      right: { type: 'constant', value: '100.000000000000000001' },
    },
  };
  expect(validatedDefinition(JSON.stringify(schema))).toEqual(schema);
});

it('移动端非法 JSON 不离开文本页；不完整对象可进表单、修改后完整回读', async () => {
  await mount(<StrategyEditorScreen />);
  await click(button('高级 JSON'));
  await input(field('完整策略 JSON'), '{ broken');
  await click(button('常用配置'));
  expect(field('完整策略 JSON').value).toBe('{ broken');
  const incomplete = {
    ...b4Definition,
    entry: { type: 'future', precision: '0.000000000000000001' },
    extension: { keep: true },
  };
  await input(field('完整策略 JSON'), JSON.stringify(incomplete));
  await click(button('常用配置'));
  await input(field('策略说明'), '继续修复');
  await click(button('高级 JSON'));
  expect(JSON.parse(field('完整策略 JSON').value)).toEqual({
    ...incomplete,
    description: '继续修复',
  });
});

it('移动端可视编辑保留原保存回执恢复路径，来源重命名与普通条件同步', async () => {
  const writes: Record<string, unknown>[] = [];
  setApi(
    vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        writes.push(body);
        return Response.json({
          ...b4Strategy,
          name: body.name,
          versions: [{ ...b4Strategy.versions[0], schema: body.schema }],
        });
      }
      return Response.json([]);
    }),
  );
  await mount(<StrategyEditorScreen />);
  await click(button('高级 JSON'));
  await input(field('完整策略 JSON'), JSON.stringify(b4Definition));
  await click(button('常用配置'));
  await input(field('来源标识'), 'renamed');
  await click(button('删除信号来源 1'));
  expect(document.body.textContent).toContain('仍被引用');
  await click(button('高级 JSON'));
  const next = JSON.parse(field('完整策略 JSON').value);
  expect(next.entry.left.sourceId).toBe('renamed');
  expect(next.schemaVersion).toBe('strategy-definition-v1');
  expect(next.signalSources[0].priceCoordinate).toBe('run');
  await click(button('确认创建策略'));
  expect(writes).toHaveLength(1);
  expect(writes[0]!.schema).toEqual(next);
});
