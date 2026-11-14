// @vitest-environment jsdom
import { useState } from 'react';
import { expect, it } from 'vitest';
import { button, click, field, input, mount } from './mobile-view-harness';
import { AiProviderFields } from '../../src/features/ai-providers/AiProviderFields';
import { aiProviderDraft, buildAiProviderInput, type AiProviderDraft } from '../../src/features/ai-providers/ai-provider-draft';
import { OptimizationModelFields } from '../../src/features/optimization-setup/OptimizationModelFields';
import { ArenaModelSelector } from '../../src/features/model-arena/ArenaModelSelector';

let draft: AiProviderDraft;
function ProviderForm() {
  const [value, change] = useState(() => ({ ...aiProviderDraft(), name: 'sample', baseUrl: 'https://models.example/v1', authMode: 'none' as const, models: 'model-a' }));
  draft = value;
  return <AiProviderFields draft={value} change={(patch) => change((current) => ({ ...current, ...patch }))}
    editing={false} disabled={false} availableModels={['model-a', 'model-b']} />;
}
it('能力和模型回显使用标签，手工模型仍以原 ID 提交且配置 JSON 保持', async () => {
  await mount(<ProviderForm />);
  await input(field('提供方能力'), '图像'); await click(button('选择 图像理解'));
  await input(field('模型列表'), 'model-b'); await click(button('选择 model-b'));
  await input(field('模型列表'), 'manual-model'); await click(button('添加 manual-model'));
  const body = buildAiProviderInput(draft, '');
  expect(body.capabilities).toEqual(['chat', 'vision']);
  expect(body.models).toEqual(['model-a', 'model-b', 'manual-model']);
  expect(body.executionRoutes).toEqual([]);
  expect(draft.modelPricing).toBe('{}');
});
it('实验选模最多三个且保留独立模型推理设置和费用提示', async () => {
  function Form() {
    const [models, setModels] = useState<string[]>([]);
    const [efforts, setEfforts] = useState<Record<string, string>>({});
    return <><OptimizationModelFields providers={['a', 'b', 'c', 'd'].map((model) => ({ provider: '来源', model,
      costStatus: 'unknown' as const, reasoning: { supportedEfforts: ['high'] } }))}
      models={models} onModelsChange={setModels} efforts={efforts} onEffortsChange={setEfforts} disabled={false} />
      <output>{JSON.stringify({ models, efforts })}</output></>;
  }
  await mount(<Form />);
  for (const model of ['a', 'b', 'c']) {
    await input(field('搜索实验模型'), model); await click(button('选择 来源 / ' + model));
  }
  await input(field('搜索实验模型'), 'd');
  expect(button('选择 来源 / d').disabled).toBe(true);
  expect(document.body.textContent).toContain('费用未知');
  const choices = [...document.querySelectorAll('[aria-label="模型推理强度"]')];
  expect(choices).toHaveLength(3);
  await click([...choices[0]!.querySelectorAll('button')].find((node) => node.textContent === '高')!);
  const state = JSON.parse(document.querySelector('output')!.textContent!);
  expect(state.models).toHaveLength(3);
  expect(state.efforts[JSON.stringify(['来源', 'a'])]).toBe('high');
});
it('同名模型的不同提供方作为独立选择，原绑定字段不变', async () => {
  function Form() {
    const [value, setValue] = useState<{ providerId: string; model: string }[]>([]);
    return <><ArenaModelSelector choices={[{ providerId: '甲', model: '同名' }, { providerId: '乙', model: '同名' }]}
      value={value} onChange={setValue} /><output>{JSON.stringify(value)}</output></>;
  }
  await mount(<Form />);
  await input(field('搜索参赛模型'), '同名'); await click(button('选择 同名 · 乙'));
  await input(field('搜索参赛模型'), '同名'); await click(button('选择 同名 · 甲'));
  expect(JSON.parse(document.querySelector('output')!.textContent!)).toEqual([{ providerId: '乙', model: '同名' }, { providerId: '甲', model: '同名' }]);
});
