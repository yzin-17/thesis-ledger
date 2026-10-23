// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AutomationTable } from '../src/features/providers/ProviderSettingsSections.js';
import { createProviderAutomationHandlers } from '../src/features/providers/providers.automation-actions.js';
import type {
  ProviderActionDependencies,
  ProviderToastManager,
} from '../src/features/providers/providers.actions.js';
import type {
  AutomationJob,
  AutomationRunNowResult,
} from '../src/features/providers/providers.types.js';

type TestToast = {
  id: string;
  title: string;
  description?: string;
};

type TestToastInput = Omit<TestToast, 'id'> & { id?: string };

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const job: AutomationJob = {
  id: 'synthetic-job-1',
  name: '合成任务',
  type: 'market-sync',
  cron: '0 16 * * 1-5',
  timezone: 'Asia/Shanghai',
  enabled: true,
  nextRunAt: null,
};

const apiError = (status: number, message: string) =>
  new ThesisLedgerApiError(status, { error: 'SyntheticError', message });

let host: HTMLDivElement | undefined;
let root: Root | undefined;
let toastManager: ProviderToastManager;
let toasts: Map<string, TestToast>;
let nextToastId: number;
let runMutation: ReturnType<typeof vi.fn>;
let deleteMutation: ReturnType<typeof vi.fn>;
let confirmDelete: boolean;
let confirmCalls: number;
let getCalls: number;
let nextDelete: Deferred<AutomationJob>;
let firstRenderDeleteHandler: ((target: AutomationJob) => Promise<void>) | undefined;

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const button = (label: string) => {
  const result = [...(host?.querySelectorAll('button') ?? [])].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!result) throw new Error(`找不到按钮：${label}`);
  return result;
};

const toastByTitle = (title: string) => [...toasts.values()].find((toast) => toast.title === title);

function AutomationRunDeleteHarness() {
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [togglingJobId, setTogglingJobId] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [readError, setReadError] = useState(false);
  const deletingJobIdRef = useRef<string | null>(null);
  const handlers = createProviderAutomationHandlers({
    toastManager,
    runningJobId,
    setRunningJobId,
    setTogglingJobId,
    deletingJobIdRef,
    setDeletingJobId,
    runJobMutation: {
      mutateAsync: (jobId: string) => runMutation(jobId) as Promise<AutomationRunNowResult>,
    },
    deleteJobMutation: {
      mutateAsync: (jobId: string) => deleteMutation(jobId) as Promise<AutomationJob>,
    },
    confirm: async () => {
      confirmCalls += 1;
      return confirmDelete;
    },
  } as unknown as ProviderActionDependencies);

  firstRenderDeleteHandler ??= handlers.deleteJob;
  return (
    <>
      <button type="button" onClick={() => setReadError(true)}>
        模拟任务读取失败
      </button>
      <AutomationTable
        loadState={readError ? 'stale' : 'ready'}
        jobs={[job]}
        readError={readError}
        reloading={false}
        onRetry={() => {
          getCalls += 1;
          setReadError(false);
        }}
        togglingJobId={togglingJobId}
        runningJobId={runningJobId}
        deletingJobId={deletingJobId}
        onToggle={(target) => void handlers.toggleJob(target)}
        onEdit={() => {}}
        onRun={(target) => void handlers.runJobNow(target)}
        onDelete={(target) => void handlers.deleteJob(target)}
        onCreate={() => {}}
      />
    </>
  );
}

beforeEach(async () => {
  toasts = new Map();
  nextToastId = 0;
  confirmDelete = false;
  confirmCalls = 0;
  getCalls = 0;
  firstRenderDeleteHandler = undefined;
  nextDelete = deferred<AutomationJob>();

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

  let runAttempts = 0;
  runMutation = vi.fn(async () => {
    runAttempts += 1;
    if (runAttempts === 1) throw apiError(503, '受控运行失败');
    return { skipped: true, reason: '受控已有实例，未执行' } satisfies AutomationRunNowResult;
  });
  deleteMutation = vi.fn((jobId: string) => nextDelete.promise.then(() => ({ ...job, id: jobId })));

  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<AutomationRunDeleteHarness />));
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  host = undefined;
  root = undefined;
});

describe('自动化运行和删除操作状态', () => {
  it('运行失败后重试清旧错；取消不请求；删除单飞并保留409任务；陈旧行仅可GET恢复', async () => {
    await act(async () => {
      button('立即运行').click();
      await settle();
    });
    expect(toastByTitle('合成任务 执行失败')).toMatchObject({
      title: '合成任务 执行失败',
      description: '受控运行失败',
    });

    await act(async () => {
      button('立即运行').click();
      await settle();
    });
    expect(toastByTitle('合成任务 执行失败')).toBeUndefined();
    expect(toastByTitle('合成任务 未执行')?.description).toBe('受控已有实例，未执行');
    expect(toastByTitle('合成任务 已执行完成')).toBeUndefined();
    expect(runMutation).toHaveBeenCalledTimes(2);

    await act(async () => {
      button('删除').click();
      await settle();
    });
    expect(deleteMutation).not.toHaveBeenCalled();

    confirmDelete = true;
    await act(async () => {
      button('删除').click();
      await settle();
    });
    expect(deleteMutation).toHaveBeenCalledTimes(1);
    expect(button('删除中…').disabled).toBe(true);
    expect(confirmCalls).toBe(2);

    await act(async () => {
      await firstRenderDeleteHandler?.(job);
      await settle();
    });
    expect(confirmCalls).toBe(2);
    expect(deleteMutation).toHaveBeenCalledTimes(1);

    await act(async () => {
      nextDelete.reject(apiError(409, '已有运行历史，受控拒绝删除'));
      await settle();
    });
    expect(host?.textContent).toContain('合成任务');
    expect(toastByTitle('合成任务 删除失败')?.description).toBe('已有运行历史，受控拒绝删除');

    nextDelete = deferred<AutomationJob>();
    await act(async () => {
      button('删除').click();
      await settle();
    });
    expect(toastByTitle('合成任务 删除失败')).toBeUndefined();
    expect(deleteMutation).toHaveBeenCalledTimes(2);
    expect(button('删除中…').disabled).toBe(true);

    await act(async () => {
      nextDelete.resolve(job);
      await settle();
    });
    expect(toastByTitle('合成任务 已删除')).toBeDefined();

    await act(async () => button('模拟任务读取失败').click());
    for (const label of ['停用', '编辑', '立即运行', '删除']) {
      expect(button(label).disabled).toBe(true);
    }
    await act(async () => button('重新读取任务').click());
    expect(getCalls).toBe(1);
    expect(runMutation).toHaveBeenCalledTimes(2);
    expect(deleteMutation).toHaveBeenCalledTimes(2);
    expect(button('立即运行').disabled).toBe(false);
  });
});
