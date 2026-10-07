import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { strategySchema } from '@thesis-ledger/schemas';
import { preparedBacktestSubmission } from './backtest-prepared-submission.js';
import type { useToastManager } from '@/components/ui/toast';

import type {
  BacktestJob,
  BacktestSetupInput,
  CreateStrategyInput,
  CreateStrategyVersionInput,
  QueueBacktestV3Input,
  StrategyRecord,
  StrategySchema,
  StrategyVersion,
} from './strategy.types.js';

type ToastManager = Pick<ReturnType<typeof useToastManager>, 'add'>;
type AsyncMutation<Input, Output> = {
  mutateAsync: (input: Input) => Promise<Output>;
};

type Dependencies = {
  name: string;
  schemaText: string;
  busyAction: string | null;
  setBusyAction: Dispatch<SetStateAction<string | null>>;
  toastManager: ToastManager;
  createMutation: AsyncMutation<CreateStrategyInput, StrategyRecord>;
  createVersionMutation?: AsyncMutation<CreateStrategyVersionInput, StrategyVersion>;
  queueMutation: AsyncMutation<QueueBacktestV3Input, BacktestJob>;
  runMutation: AsyncMutation<string, BacktestJob>;
  cancelMutation: AsyncMutation<string, BacktestJob>;
  retryMutation: AsyncMutation<string, BacktestJob>;
  onJobQueued?: (job: BacktestJob) => void;
  load: () => Promise<unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseSchemaText = (schemaText: string): StrategySchema => {
  const parsed: unknown = JSON.parse(schemaText);
  if (!isRecord(parsed)) throw new Error('strategy-schema');
  return parsed;
};

const errorToast = (toastManager: ToastManager, title: string, description: string) => {
  toastManager.add({
    title,
    description,
    type: 'error',
    timeout: 0,
    priority: 'high',
  });
};

const refreshSavedStrategy = async (load: Dependencies['load'], toastManager: ToastManager) => {
  try {
    await load();
    return true;
  } catch {
    errorToast(
      toastManager,
      '保存已完成，列表刷新失败',
      '请使用页面刷新按钮重新读取，无需重复保存。',
    );
    return false;
  }
};

const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

export const validateBacktestSetup = (setup: BacktestSetupInput) => {
  if (!validDate(setup.period.start) || !validDate(setup.period.end)) {
    return '请选择有效的回测日期。';
  }
  if (setup.period.start > setup.period.end) return '开始日期不能晚于结束日期。';
  if (!Number.isFinite(setup.initialCash) || setup.initialCash <= 0) {
    return '初始资金必须大于 0。';
  }
  if (
    setup.inSampleEnd &&
    (!validDate(setup.inSampleEnd) ||
      setup.inSampleEnd < setup.period.start ||
      setup.inSampleEnd > setup.period.end)
  ) {
    return '样本内结束日期必须位于回测区间内。';
  }
  return null;
};

export const createStrategyActionHandlers = (dependencies: Dependencies) => {
  const {
    name,
    schemaText,
    busyAction,
    setBusyAction,
    toastManager,
    createMutation,
    createVersionMutation,
    queueMutation,
    runMutation,
    cancelMutation,
    load,
  } = dependencies;
  let backgroundPreparationVersionId: string | null = null;
  let backgroundPreparationIdempotencyKey: string | null = null;

  const refreshStrategyData = () => {
    void load().catch(() => undefined);
  };

  const createStrategy = async (eventOrInput: FormEvent<HTMLFormElement> | CreateStrategyInput) => {
    if ('preventDefault' in eventOrInput) eventOrInput.preventDefault();
    if (busyAction) return false;
    setBusyAction('create-strategy');
    try {
      const input =
        'preventDefault' in eventOrInput
          ? { name, schema: { ...parseSchemaText(schemaText), name } }
          : { ...eventOrInput, schema: { ...eventOrInput.schema, name: eventOrInput.name } };
      await createMutation.mutateAsync(input);
      if (!(await refreshSavedStrategy(load, toastManager))) return true;
      toastManager.add({
        title: '策略已创建',
        description: '策略 v1 已保存，旧版本不会被覆盖。',
        type: 'success',
        timeout: 2800,
      });
      return true;
    } catch {
      errorToast(toastManager, '策略创建失败', '请检查策略配置或服务连接。');
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const createVersion = async (strategyId: string, schema: StrategySchema) => {
    if (busyAction || !createVersionMutation) return false;
    setBusyAction(`create-version:${strategyId}`);
    try {
      await createVersionMutation.mutateAsync({ strategyId, schema });
      if (!(await refreshSavedStrategy(load, toastManager))) return true;
      toastManager.add({
        title: '新版本已保存',
        description: '原有版本保持不变。',
        type: 'success',
        timeout: 2800,
      });
      return true;
    } catch {
      errorToast(toastManager, '版本保存失败', '请检查策略配置或服务连接。');
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const startBacktest = (version: StrategyVersion, setup: BacktestSetupInput): Promise<boolean> => {
    if (busyAction || backgroundPreparationVersionId) return Promise.resolve(false);
    const setupError = validateBacktestSetup(setup);
    if (setupError) {
      errorToast(toastManager, '回测配置无效', setupError);
      return Promise.resolve(false);
    }
    const schema = version.schema;
    if (!schema) {
      errorToast(toastManager, '回测排队失败', '当前版本缺少可执行 Schema，请重新加载策略。');
      return Promise.resolve(false);
    }
    if (!strategySchema.safeParse(schema).success) {
      errorToast(toastManager, '回测排队失败', '策略定义不可用，请先保存有效的当前策略版本。');
      return Promise.resolve(false);
    }
    if (!setup.prepared) {
      errorToast(toastManager, '回测排队失败', '请先准备并确认回测配置。');
      return Promise.resolve(false);
    }
    backgroundPreparationVersionId = version.id;
    backgroundPreparationIdempotencyKey = crypto.randomUUID();
    setBusyAction(`queue:${version.id}`);
    toastManager.add({
      title: '正在后台准备回测',
      description: '完成后会出现在回测任务列表。',
      type: 'success',
      timeout: 2800,
    });
    void (async () => {
      try {
        const idempotencyKey = backgroundPreparationIdempotencyKey;
        if (!idempotencyKey) throw new Error('backtest-idempotency');
        const job = await queueMutation.mutateAsync(
          preparedBacktestSubmission(version.id, setup, idempotencyKey),
        );
        if (job.status === 'failed') {
          errorToast(
            toastManager,
            '回测失败',
            `${job.errorCode ?? 'DATA_UNAVAILABLE'}：${job.errorSummary ?? '服务端未提供具体原因'}`,
          );
          refreshStrategyData();
          return;
        }
        toastManager.add({
          title: '回测已排队',
          description: '任务已提交，服务端将按策略版本读取所需数据。',
          type: 'success',
          timeout: 2800,
        });
        dependencies.onJobQueued?.(job);
        refreshStrategyData();
      } catch (error) {
        errorToast(
          toastManager,
          '回测排队失败',
          error instanceof Error ? error.message : '请检查策略配置、市场数据和服务连接。',
        );
      } finally {
        backgroundPreparationVersionId = null;
        backgroundPreparationIdempotencyKey = null;
        setBusyAction(null);
      }
    })();
    return Promise.resolve(true);
  };

  const run = async (jobId: string) => {
    if (busyAction) return;
    setBusyAction(`run:${jobId}`);
    try {
      await runMutation.mutateAsync(jobId);
      toastManager.add({ title: '回测已启动', type: 'success', timeout: 2800 });
      await load();
    } catch {
      errorToast(toastManager, '回测启动失败', '请检查任务状态和服务连接。');
    } finally {
      setBusyAction(null);
    }
  };

  const cancel = async (jobId: string) => {
    if (busyAction) return;
    setBusyAction(`cancel:${jobId}`);
    try {
      await cancelMutation.mutateAsync(jobId);
      toastManager.add({ title: '回测已取消', type: 'success', timeout: 2800 });
      await load();
    } catch {
      errorToast(toastManager, '回测取消失败', '请检查任务状态和服务连接。');
    } finally {
      setBusyAction(null);
    }
  };

  const retry = async (jobId: string) => {
    if (busyAction) return;
    setBusyAction(`retry:${jobId}`);
    try {
      await dependencies.retryMutation.mutateAsync(jobId);
      toastManager.add({ title: '回测已重新排队', type: 'success', timeout: 2800 });
      await load();
    } catch {
      errorToast(toastManager, '回测重试失败', '请检查任务状态、快照和服务连接。');
    } finally {
      setBusyAction(null);
    }
  };

  return { createStrategy, createVersion, startBacktest, run, cancel, retry };
};
