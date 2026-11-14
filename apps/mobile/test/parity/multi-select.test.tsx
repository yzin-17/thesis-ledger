// @vitest-environment jsdom
import { useState } from 'react';
import { expect, it } from 'vitest';
import { button, click, field, input, mount } from './mobile-view-harness';
import { MultiSelect } from '../../src/components/MultiSelect';

function Form({ initial = [] as string[], disabled = false, maxSelected = 2, allowCustom = false }) {
  const [value, setValue] = useState(initial);
  return <><MultiSelect label="模型" options={[{ value: 'a', label: '模型甲' }, { value: 'b', label: '模型乙' }]}
    value={value} onChange={setValue} disabled={disabled} maxSelected={maxSelected} allowCustom={allowCustom} />
    <output>{JSON.stringify(value)}</output></>;
}
const values = () => JSON.parse(document.querySelector('output')!.textContent!) as string[];
it('连续添加清空输入，已选可搜索取消并保持选择顺序', async () => {
  await mount(<Form />);
  await input(field('模型'), '乙'); await click(button('选择 模型乙'));
  expect(field('模型').value).toBe('');
  await input(field('模型'), '甲'); await click(button('选择 模型甲'));
  expect(values()).toEqual(['b', 'a']);
  await input(field('模型'), '乙'); await click(button('取消选择 模型乙'));
  expect(values()).toEqual(['a']);
});
it('上限限制新增但允许取消，未知值保持可见且可移除', async () => {
  await mount(<Form initial={['old']} maxSelected={1} />);
  await input(field('模型'), '模型甲');
  expect(button('选择 模型甲').disabled).toBe(true);
  await click(button('选择 模型甲'));
  expect(values()).toEqual(['old']);
  await input(field('模型'), 'old'); await click(button('取消选择 old'));
  expect(values()).toEqual([]);
});
it('允许手工输入模型并阻止重复添加', async () => {
  await mount(<Form allowCustom />);
  await input(field('模型'), 'custom-model'); await click(button('添加 custom-model'));
  expect(values()).toEqual(['custom-model']);
  await input(field('模型'), 'custom-model');
  expect(button('添加 custom-model')).toBeUndefined();
  expect(button('取消选择 custom-model')).toBeTruthy();
});
it('禁用时输入和已选移除均不能改值', async () => {
  await mount(<Form initial={['a']} disabled />);
  expect(field('模型').readOnly).toBe(true);
  await click(document.querySelector('[aria-label="移除 模型甲"]')! as HTMLElement);
  expect(values()).toEqual(['a']);
});
