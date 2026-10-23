// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createProviderAutomationHandlers } from '../src/features/providers/providers.automation-actions.js';
import type {
  ProviderActionDependencies,
  ProviderToastManager,
} from '../src/features/providers/providers.actions.js';
import {
  automationJobDraftFromJob,
  newAutomationJobDraft,
  type AutomationJob,
  type AutomationJobDraft,
} from '../src/features/providers/providers.types.js';

type TestToast = {
  id: string;
  title: string;
  description?: string;
  type?: string;
};

type TestToastInput = Omit<TestToast, 'id'> & { id?: string };

const job = (id: string, name: string, enabled = true): AutomationJob => ({
  id,
  name,
  type: 'market-sync',
  cron: '0 16 * * 1-5',
  timezone: 'Asia/Shanghai',
  enabled,
  nextRunAt: null,
});

const updateError = () =>
  new ThesisLedgerApiError(503, { error: 'ServiceUnavailable', message: '受控任务编辑失败' });

const createError = () =>
  new ThesisLedgerApiError(503, { error: 'ServiceUnavailable', message: '受控任务创建失败' });

const toggleError = () =>
  new ThesisLedgerApiError(503, { error: 'ServiceUnavailable', message: '受控启停失败' });

let host: HTMLDivElement | undefined;
let root: Root | undefined;
let toasts: Map<string, TestToast>;
let nextToastId: number;
let toastManager: ProviderToastManager;
let renderCount: number;
let updateAttempts: number;
let createAttempts: number;
let toggleAttempts: Record<string, number>;
let renderedJob: AutomationJob;
let renderedOtherJob: AutomationJob;

const toastByTitle = (title: string) => [...toasts.values()].find((toast) => toast.title === title);

const click = (label: string) => {
  const button = [...(host?.querySelectorAll('button') ?? [])].find(
    (candidate) => candidate.textContent === label,
  );
  if (!button) throw new Error(`找不到按钮：${label}`);
  button.click();
};

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function AutomationActionsHarness() {
  const [automationDraft, setAutomationDraft] = useState<AutomationJobDraft>(() => ({
    ...automationJobDraftFromJob(renderedJob),
    name: '当前任务（已编辑）',
  }));
  const [editingAutomationJob, setEditingAutomationJob] = useState<AutomationJob | null>(
    renderedJob,
  );
  const [savingAutomationDraft, setSavingAutomationDraft] = useState(false);
  const [, setTogglingJobId] = useState<string | null>(null);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const handlers = createProviderAutomationHandlers({
    toastManager,
    automationDraft,
    editingAutomationJob,
    savingAutomationDraft,
    runningJobId,
    setTogglingJobId,
    setAutomationDraft,
    setEditingAutomationJob,
    setSavingAutomationDraft,
    setRunningJobId,
    setAutomationSheetOpen: vi.fn(),
    updateJobMutation: {
      mutateAsync: async () => {
        updateAttempts += 1;
        if (updateAttempts === 1) throw updateError();
        return renderedJob;
      },
    },
    createJobMutation: {
      mutateAsync: async () => {
        createAttempts += 1;
        if (createAttempts === 1) throw createError();
        return renderedJob;
      },
    },
    toggleJobMutation: {
      mutateAsync: async ({ jobId, enabled }: { jobId: string; enabled: boolean }) => {
        toggleAttempts[jobId] = (toggleAttempts[jobId] ?? 0) + 1;
        if (toggleAttempts[jobId] === 1) throw toggleError();
        return { enabled };
      },
    },
  } as unknown as ProviderActionDependencies);

  renderCount += 1;
  return (
    <>
      <form onSubmit={handlers.submitAutomationEditor}>
        <button type="submit">保存任务</button>
      </form>
      <button
        type="button"
        onClick={() => {
          setEditingAutomationJob(null);
          setAutomationDraft(newAutomationJobDraft());
        }}
      >
        切换到创建
      </button>
      <button type="button" onClick={() => void handlers.toggleJob(renderedJob)}>
        切换目标任务
      </button>
      <button type="button" onClick={() => void handlers.toggleJob(renderedOtherJob)}>
        切换其他任务
      </button>
    </>
  );
}

beforeEach(async () => {
  toasts = new Map();
  nextToastId = 0;
  renderCount = 0;
  updateAttempts = 0;
  createAttempts = 0;
  toggleAttempts = {};
  renderedJob = job('job-current', '当前任务');
  renderedOtherJob = job('job-other', '其他任务');

  const add = vi.fn((options: TestToastInput) => {
    const id = options.id ?? `generated-toast-${++nextToastId}`;
    toasts.set(id, { ...options, id });
    return id;
  });
  const close = vi.fn((id?: string) => {
    if (id) toasts.delete(id);
    else toasts.clear();
  });
  toastManager = { add, close } as unknown as ProviderToastManager;

  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<AutomationActionsHarness />));
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  host = undefined;
  root = undefined;
});

describe('自动化操作失败 Toast 生命周期', () => {
  it('重建 handler 后重试编辑与创建只清理各自旧失败，行级重试按 jobId 隔离', async () => {
    toastManager.add({
      id: 'unrelated-operation-error',
      title: '其他操作错误',
      type: 'error',
      timeout: 0,
      priority: 'high',
    } as TestToastInput);

    const initialRenderCount = renderCount;
    await act(async () => {
      click('保存任务');
      await settle();
    });
    expect(renderCount).toBeGreaterThan(initialRenderCount);
    expect(toastByTitle('保存任务失败')).toMatchObject({
      title: '保存任务失败',
      description: '受控任务编辑失败',
    });

    await act(async () => {
      click('切换其他任务');
      await settle();
    });
    expect(toastByTitle('其他任务 停用失败')).toBeDefined();

    await act(async () => {
      click('切换目标任务');
      await settle();
    });
    expect(toastByTitle('当前任务 停用失败')).toBeDefined();
    expect(toastByTitle('其他任务 停用失败')).toBeDefined();

    await act(async () => {
      click('切换目标任务');
      await settle();
    });
    expect(toastByTitle('当前任务 停用失败')).toBeUndefined();
    expect(toastByTitle('当前任务 已停用')).toBeDefined();
    expect(toastByTitle('保存任务失败')).toBeDefined();
    expect(toastByTitle('其他任务 停用失败')).toBeDefined();
    expect(toastByTitle('其他操作错误')).toBeDefined();

    await act(async () => {
      click('保存任务');
      await settle();
    });
    expect(toastByTitle('保存任务失败')).toBeUndefined();
    expect(toastByTitle('任务「当前任务（已编辑）」已保存')).toBeDefined();
    expect(toastByTitle('其他任务 停用失败')).toBeDefined();
    expect(toastByTitle('其他操作错误')).toBeDefined();

    await act(async () => {
      click('切换到创建');
    });
    await act(async () => {
      click('保存任务');
      await settle();
    });
    expect(toastByTitle('创建任务失败')).toMatchObject({
      title: '创建任务失败',
      description: '受控任务创建失败',
    });

    await act(async () => {
      click('保存任务');
      await settle();
    });
    expect(toastByTitle('创建任务失败')).toBeUndefined();
    expect(toastByTitle('任务「当前任务」已创建')).toBeDefined();
    expect(toastByTitle('其他任务 停用失败')).toBeDefined();
    expect(toastByTitle('其他操作错误')).toBeDefined();
  });
});
