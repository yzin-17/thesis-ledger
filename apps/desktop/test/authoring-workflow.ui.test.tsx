// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authoringStrategySchema } from '@thesis-ledger/schemas';
import { AuthoringWorkflow } from '../src/features/strategy-authoring/AuthoringDraftEditor.js';
import { AuthoringSavePanel } from '../src/features/strategy-authoring/AuthoringEditorForms.js';
import { AuthoringDraftRecovery } from '../src/features/strategy-authoring/AuthoringDraftRecovery.js';
import { emptyAuthoringContent } from '../src/features/strategy-authoring/use-authoring-draft.js';
import type { AuthoringEditorModel } from '../src/features/strategy-authoring/use-authoring-editor.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const definition = authoringStrategySchema.parse(
  readFileSync('../../packages/schemas/fixtures/strategy-authoring.exchange.json', 'utf8'),
);
let root: Root | undefined;
let host: HTMLDivElement;
let client: QueryClient;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  client?.clear();
});
function editor() {
  return {
    content: { ...emptyAuthoringContent },
    draft: {
      query: { data: { revision: 3 } },
      dirty: false,
      busy: false,
      edit: vi.fn(),
      flush: vi.fn(),
    },
    editing: true,
    busy: false,
    active: false,
    controls: { analyze: false, generate: false, modify: false },
    models: { data: [] },
    modelKey: '',
    setModelKey: vi.fn(),
    setCostAcknowledged: vi.fn(),
    history: { data: [] },
    operation: {},
    perform: { mutate: vi.fn() },
    readLatest: vi.fn(),
    discardDraft: vi.fn(),
    submit: vi.fn(),
    applyOperation: vi.fn(),
    applyProposal: vi.fn(),
    reviewCurrent: vi.fn(),
    save: vi.fn(),
    setReviewed: vi.fn(),
    reviewed: false,
    generationReady: false,
  } as unknown as AuthoringEditorModel;
}
async function render(ui: React.ReactNode) {
  if (!root) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  }
  await act(async () =>
    root!.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>,
    ),
  );
}
function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button,[role="menuitem"]')].find(
    (item) => item.textContent === text,
  );
  if (!found) throw new Error(`未找到按钮：${text}`);
  return found;
}

describe('自然语言策略编写阶段', () => {
  it('空草稿只引导描述和分析，不提前展示修改、保存或定义错误', async () => {
    const model = editor();
    await render(<AuthoringWorkflow model={model} />);
    expect(host.querySelector('[aria-label="描述你的策略"]')).not.toBeNull();
    expect(button('分析描述').disabled).toBe(true);
    expect(button('3 审阅保存').getAttribute('aria-disabled')).toBe('true');
    expect(host.textContent).not.toContain('生成修改建议');
    expect(host.textContent).not.toContain('审核当前修订');
    expect(host.textContent).not.toContain('尚未生成定义');
    expect(model.submit).not.toHaveBeenCalled();
  });

  it('分析结果须明确应用，内容写入后才自动进入条件确认并显示尚缺事项', async () => {
    const model = editor();
    model.operation = {
      data: {
        id: 'op',
        revision: 3,
        status: 'succeeded',
        disposition: 'unapplied',
        input: { selection: { kind: 'analyze', providerId: 'fixture', model: 'controlled' } },
        outcome: null,
      },
    } as AuthoringEditorModel['operation'];
    await render(<AuthoringWorkflow model={model} />);
    expect(host.querySelector('[aria-label="描述你的策略"]')).not.toBeNull();
    await act(async () => button('确认应用分析结果').click());
    expect(model.applyOperation).toHaveBeenCalledExactlyOnceWith('apply-analysis');
    model.content = {
      ...model.content,
      description: '均线策略',
      questions: [
        {
          id: 'q',
          basedOnRevision: 3,
          quote: '仓位',
          reason: '投入多少',
          options: [],
          dependsOn: [],
          answer: null,
          answerState: 'unanswered',
        },
      ],
      requirements: [
        {
          id: 'r',
          quote: '日线',
          interpretation: '日线',
          state: 'unresolved',
          definitionPaths: [],
        },
      ],
    };
    await render(<AuthoringWorkflow model={model} />);
    expect(host.textContent).toContain('1 个问题待确认');
    expect(host.textContent).toContain('1 条需求待确认或处理');
    expect(host.textContent).toContain('确认全部交易条件');
    expect(button('生成草稿').disabled).toBe(true);
    expect(model.submit).not.toHaveBeenCalled();
  });

  it('有定义后进入审阅，仍能返回描述；无效定义保留修正入口', async () => {
    const model = editor();
    await render(<AuthoringWorkflow model={model} />);
    model.content = { ...model.content, definitionText: JSON.stringify(definition) };
    await render(<AuthoringWorkflow model={model} />);
    expect(host.textContent).toContain('当前实际定义');
    expect(host.textContent).toContain('用自然语言局部修改');
    await act(async () => button('1 描述策略').click());
    expect(host.querySelector('[aria-label="描述你的策略"]')).not.toBeNull();
    await act(async () => button('3 审阅保存').click());
    model.content = { ...model.content, definitionText: '{invalid' };
    await render(<AuthoringWorkflow model={model} />);
    expect(host.textContent).toContain('定义需要修正');
    expect(host.querySelector('[aria-label="策略定义 JSON"]')).not.toBeNull();
    model.content = { ...model.content, definitionText: '' };
    await render(<AuthoringWorkflow model={model} />);
    expect(host.querySelector('[aria-label="策略定义 JSON"]')).not.toBeNull();
    await act(async () => button('1 描述策略').click());
    await act(async () => button('3 审阅保存').click());
    expect(host.querySelector('[aria-label="策略定义 JSON"]')).not.toBeNull();
  });

  it.each(['dirty', 'revision'] as const)('当前审核在 %s 变化后不能直接保存', async (change) => {
    const model = editor();
    model.content = {
      ...model.content,
      title: '均线策略',
      definitionText: JSON.stringify(definition),
    };
    model.generationReady = true;
    model.review = { revision: 3, definition, definitionHash: 'a'.repeat(64) };
    model.reviewed = true;
    if (change === 'dirty') model.draft.dirty = true;
    else model.review.revision = 2;
    await render(<AuthoringSavePanel model={model} />);
    expect(button('确认保存策略 v1').disabled).toBe(true);
    expect(model.save).not.toHaveBeenCalled();
  });

  it('草稿操作提供本地内容复制', async () => {
    await render(<AuthoringDraftRecovery content={{ description: '本地输入' }} disabled={false} />);
    await act(async () => button('草稿操作').click());
    expect(button('复制本地草稿')).toBeDefined();
    expect(
      [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
    ).toEqual(['复制本地草稿']);
  });
});
