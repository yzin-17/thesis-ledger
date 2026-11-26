import { spawn } from 'node:child_process';

export function aiProviderTestTimeout(environment, tests) {
  const maximum =
    tests.length === 1 &&
    tests[0] === 'test/backtest/practical-v6-model-acceptance.integration.test.ts' &&
    environment.BACKTEST_PLAN_SCENARIO === 'backtest-practical-v6' &&
    environment.PRACTICAL_V6_MODEL_LIVE === '1'
      ? 3_300_000
      : 900_000;
  const timeout = Number(environment.AI_PROVIDER_TEST_TIMEOUT_MS ?? 120_000);
  if (!Number.isSafeInteger(timeout) || timeout < 120_000 || timeout > maximum)
    throw new Error(
      `AI_PROVIDER_TEST_TIMEOUT_MS 必须是120000～${maximum}的整数，仅控制隔离测试等待`,
    );
  return timeout;
}

/** 只终止本次新建的测试进程组；确认退出后调用方才可清理隔离库。 */
export function runAiProviderTestProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    const { timeout, ...spawnOptions } = options;
    const grouped = process.platform !== 'win32';
    const child = spawn(command, args, { ...spawnOptions, detached: grouped });
    let expired = false,
      forced;
    const stop = (signal) => {
      try {
        if (child.pid) process.kill(grouped ? -child.pid : child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };
    const timer = setTimeout(() => {
      expired = true;
      stop('SIGTERM');
      forced = setTimeout(() => stop('SIGKILL'), 1000);
    }, timeout);
    child.once('error', (error) => {
      clearTimeout(timer);
      clearTimeout(forced);
      reject(error);
    });
    child.once('close', (status, signal) => {
      clearTimeout(timer);
      clearTimeout(forced);
      // pnpm退出不代表其Vitest／Worker后代退出，隔离资源不能在此留下消费者。
      stop('SIGKILL');
      if (expired)
        reject(
          Object.assign(new Error('隔离测试等待超时，所属进程组已停止'), { code: 'ETIMEDOUT' }),
        );
      else resolve({ status, signal });
    });
  });
}
