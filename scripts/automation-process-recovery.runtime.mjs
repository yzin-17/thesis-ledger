import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';

const require = createRequire('/app/apps/server/package.json');
const { PrismaClient } = require('@prisma/client');
const { AutomationExecutionStore } =
  await import('/app/apps/server/dist/src/automation/automation-execution-store.js');
let raw = '';
for await (const part of process.stdin) raw += part;
const config = JSON.parse(raw);
const url = new URL(config.databaseUrl);
assert.match(url.hostname, /^ledger-automation-test-[a-f0-9]{8}$/u);
assert.equal(url.pathname, '/automation_process_fixture');
assert.equal(url.username, 'fixture_owner');
const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
const children = new Set();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function worker() {
  const { createRequire } = await import('node:module');
  const assert = (await import('node:assert/strict')).default;
  let raw = '';
  for await (const part of process.stdin) raw += part;
  const input = JSON.parse(raw);
  assert.equal(process.ppid, input.controllerPid);
  assert.equal(process.env.THESIS_LEDGER_AUTOMATION_SMOKE, input.token);
  Object.assign(process.env, {
    DATABASE_URL: input.databaseUrl,
    REDIS_URL: 'redis://127.0.0.1:1',
    DSA_BASE_URL: 'http://127.0.0.1:1',
    THESIS_LEDGER_DSA_TOKEN: 'isolated-fixture',
    CREDENTIAL_ENCRYPTION_KEY: 'isolated-fixture-key-only',
  });
  const require = createRequire('/app/apps/server/package.json');
  const { PrismaClient } = require('@prisma/client');
  const { AutomationService } =
    await import('/app/apps/server/dist/src/automation/automation.service.js');
  const { AutomationScheduler } =
    await import('/app/apps/server/dist/src/automation/automation.scheduler.js');
  const { AutomationRuntimeHandlers } =
    await import('/app/apps/server/dist/src/automation/automation-runtime.service.js');
  const { RecurringCashDepositService } =
    await import('/app/apps/server/dist/src/cash-plans/recurring-cash-deposit.service.js');
  const prisma = new PrismaClient({ datasources: { db: { url: input.databaseUrl } } });
  const [identity] = await prisma.$queryRawUnsafe(
    'SELECT current_database() AS database, current_user AS owner',
  );
  assert.equal(identity.database, 'automation_process_fixture');
  assert.equal(identity.owner, 'fixture_owner');
  globalThis.fetch = () => {
    throw new Error('进程验收不允许 HTTP 上游请求');
  };
  const notifications = {
    enqueue: async (subject, message) => {
      process.stdout.write(
        JSON.stringify({ event: 'notification-captured', subject, message }) + '\n',
      );
      return [];
    },
  };
  const service = new AutomationService(prisma, {}, notifications);
  const cash = new RecurringCashDepositService(prisma, {}, notifications);
  const runtimeHandlers = new AutomationRuntimeHandlers(prisma, {}, {}, {}, {}, cash, {});
  const handlers = {
    for(type) {
      return {
        type,
        scheduledGate: async () => ({ allowed: true }),
        async run(_signal, scheduledAt, trigger) {
          assert.equal(trigger, 'scheduled');
          let result = { fixture: true, recoveredBy: input.instance };
          if (type === 'cash-deposit-materialization') {
            result = await runtimeHandlers.for(type).run(_signal, scheduledAt, trigger);
          }
          process.stdout.write(
            JSON.stringify({ event: 'entered', pid: process.pid, type, scheduledAt, result }) +
              '\n',
          );
          if (input.hold)
            await new Promise((resolve) => {
              process.once('message', (message) => {
                assert.equal(message.token, input.token);
                assert.equal(message.command, 'release');
                resolve();
              });
            });
          return result;
        },
      };
    },
  };
  const scheduler = new AutomationScheduler(prisma, service, handlers);
  const keepAlive = setInterval(() => {}, 1000);
  process.on('SIGTERM', async () => {
    scheduler.onModuleDestroy();
    clearInterval(keepAlive);
    await prisma.$disconnect();
    process.exit(0);
  });
  await scheduler.onModuleInit();
  process.stdout.write(JSON.stringify({ event: 'scheduler-started', pid: process.pid }) + '\n');
}

function startWorker(hold, instance) {
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `(${worker.toString()})().catch(error => { console.error(error.message); process.exit(1); })`,
    ],
    {
      cwd: '/app',
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'development',
        THESIS_LEDGER_AUTOMATION_SMOKE: config.token,
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    },
  );
  assert.ok(child.pid > 1 && child.pid !== process.pid);
  const state = { child, events: [], stderr: '', signal: null };
  let pending = '';
  child.stdout.on('data', (chunk) => {
    pending += chunk;
    let index;
    while ((index = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, index);
      pending = pending.slice(index + 1);
      try {
        state.events.push(JSON.parse(line));
      } catch {
        /* Nest 日志不作为业务回执。 */
      }
    }
  });
  child.stderr.on('data', (chunk) => {
    state.stderr = (state.stderr + chunk).slice(-1000);
  });
  child.on('exit', (_code, signal) => {
    state.signal = signal;
  });
  child.stdin.end(JSON.stringify({ ...config, controllerPid: process.pid, hold, instance }));
  children.add(child);
  return state;
}

async function until(read, predicate, description, budget = 12_000) {
  const end = Date.now() + budget;
  while (Date.now() < end) {
    const value = await read();
    if (predicate(value)) return value;
    await wait(50);
  }
  throw new Error(`等待超时：${description}`);
}

async function stop(child, signal = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return;
  assert.ok(children.has(child) && child.pid > 1 && child.pid !== process.pid);
  const exited = once(child, 'exit');
  child.kill(signal);
  const timeout = setTimeout(() => {
    child.kill('SIGKILL');
  }, 3000);
  try {
    await exited;
  } finally {
    clearTimeout(timeout);
  }
}

async function lease(runId) {
  const [row] = await prisma.$queryRawUnsafe(
    'SELECT l.*, r.status, r.output FROM "AutomationRunLease" l JOIN "AutomationRun" r ON r.id=l."runId" WHERE l."runId"=$1::uuid',
    runId,
  );
  return row;
}

async function scenario(type, replaySafe) {
  let scheduledAt = new Date(Date.now() - 1000);
  let cashPlans;
  if (type === 'cash-deposit-materialization') {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(new Date())
      .split('-')
      .map(Number);
    scheduledAt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 1));
    if (scheduledAt.getTime() >= Date.now()) scheduledAt.setUTCDate(scheduledAt.getUTCDate() - 1);
    cashPlans = await seedCashPlans(scheduledAt);
  }
  const fixture = {
    name: `进程验收-${type}`,
    type,
    cron: cashPlans ? '0 9 * * *' : '0 0 1 1 *',
    timezone: cashPlans ? 'Asia/Shanghai' : 'UTC',
    enabled: true,
    nextRunAt: scheduledAt,
    retryPolicy: { maxAttempts: 1, backoffMs: 1 },
    lockTtlMs: 900,
  };
  const seeded = await prisma.automationJob.findFirst({ where: { type } });
  const job = seeded
    ? await prisma.automationJob.update({ where: { id: seeded.id }, data: fixture })
    : await prisma.automationJob.create({ data: fixture });
  const first = startWorker(true, 'owner-1');
  await until(
    () => {
      if (first.child.exitCode !== null) throw new Error(`首 owner 提前退出：${first.stderr}`);
      return first.events;
    },
    (rows) => rows.some((row) => row.event === 'entered' && row.type === type),
    '首 owner 进入 handler',
  );
  const run = await prisma.automationRun.findFirstOrThrow({ where: { jobId: job.id } });
  const beforeKill = await lease(run.id);
  assert.equal(beforeKill.status, 'running');
  assert.equal(beforeKill.trigger, 'scheduled');
  assert.equal(beforeKill.executionAttempt, 1);
  assert.equal(beforeKill.recoveryPolicy, replaySafe ? 'replay-safe' : 'unknown-outcome');
  await stop(first.child, 'SIGKILL');
  assert.equal(first.child.signalCode, 'SIGKILL');
  await wait(Math.max(0, new Date(beforeKill.leaseUntil).getTime() - Date.now()) + 75);
  const recoverers = [startWorker(true, 'owner-2a'), startWorker(true, 'owner-2b')];
  const store = new AutomationExecutionStore(prisma);
  if (replaySafe) {
    await until(
      () =>
        recoverers
          .flatMap((owner) => owner.events)
          .filter((row) => row.event === 'entered' && row.type === type),
      (rows) => rows.length === 1,
      '新 owner 进入 handler 后保持 running',
    );
    const activeOwner = await lease(run.id);
    assert.equal(activeOwner.status, 'running');
    assert.equal(activeOwner.executionAttempt, 2);
    assert.equal(await store.complete(run.id, 1, { staleOwner: true }, 1), false);
    assert.equal(await store.fail(run.id, 1, new Error('新 owner 运行中拒绝旧提交')), false);
    assert.equal(await store.renewLease(run.id, 1, 900), false);
    for (const owner of recoverers) owner.child.send({ command: 'release', token: config.token });
  }
  const terminal = await until(
    () => lease(run.id),
    (row) => row.status === (replaySafe ? 'succeeded' : 'unknown_outcome'),
    '真实租约到期后终态',
  );
  await wait(100);
  for (const owner of recoverers) await stop(owner.child);
  const entered = recoverers
    .flatMap((owner) => owner.events)
    .filter((row) => row.event === 'entered' && row.type === type);
  assert.equal(entered.length, replaySafe ? 1 : 0);
  assert.equal(terminal.executionAttempt, replaySafe ? 2 : 1);
  assert.equal(await prisma.automationRun.count({ where: { jobId: job.id } }), 1);
  assert.equal(await store.complete(run.id, 1, { staleOwner: true }, 1), false);
  assert.equal(await store.fail(run.id, 1, new Error('旧 owner 晚到')), false);
  assert.equal(await store.renewLease(run.id, 1, 900), false);
  assert.deepEqual(await lease(run.id), terminal);
  let cashMaterialization;
  if (cashPlans) {
    const occurrences = await prisma.recurringCashDepositOccurrence.findMany({
      orderBy: [{ planId: 'asc' }, { periodKey: 'asc' }],
    });
    assert.equal(occurrences.length, 4);
    assert.equal(new Set(occurrences.map((row) => `${row.planId}:${row.periodKey}`)).size, 4);
    assert.ok(occurrences.every((row) => row.status === 'PENDING'));
    assert.equal(occurrences.filter((row) => row.planId === cashPlans.paused).length, 0);
    const captured = [first, ...recoverers]
      .flatMap((owner) => owner.events)
      .filter((row) => row.event === 'notification-captured');
    assert.equal(captured.length, 2);
    assert.equal(await prisma.ledgerEvent.count(), 0);
    cashMaterialization = {
      occurrences: 4,
      planCounts: cashPlans.active.map(
        (id) => occurrences.filter((row) => row.planId === id).length,
      ),
      pausedOccurrences: 0,
      notificationCaptureCount: captured.length,
      externalDelivery: false,
      ledgerEvents: 0,
      firstResult: first.events.find((row) => row.event === 'entered').result,
      recoveryResult: terminal.output,
    };
  }
  await prisma.automationJob.update({ where: { id: job.id }, data: { enabled: false } });
  return {
    type,
    jobId: job.id,
    runId: run.id,
    trigger: beforeKill.trigger,
    firstPid: first.child.pid,
    killedBy: first.child.signalCode,
    ownerAttempts: [beforeKill.executionAttempt, terminal.executionAttempt],
    finalStatus: terminal.status,
    recoveryPolicy: terminal.recoveryPolicy,
    recoveredHandlerCalls: entered.length,
    canonicalRunCount: 1,
    staleOwnerRejected: true,
    staleOwnerRejectedWhileNewOwnerRunning: replaySafe,
    recoveryPids: recoverers.map((owner) => owner.child.pid),
    ...(cashMaterialization ? { cashMaterialization } : {}),
  };
}

async function seedCashPlans(scheduledAt) {
  const { RecurringCashDepositService } =
    await import('/app/apps/server/dist/src/cash-plans/recurring-cash-deposit.service.js');
  const account = await prisma.account.create({
    data: {
      name: '调度器隔离现金验收',
      type: 'cash',
      mode: 'actual',
      currency: 'CNY',
      active: true,
    },
  });
  const cash = new RecurringCashDepositService(prisma, {}, {});
  const current = scheduledAt.toISOString().slice(0, 7);
  const earlier = new Date(Date.UTC(scheduledAt.getUTCFullYear(), scheduledAt.getUTCMonth() - 2, 1))
    .toISOString()
    .slice(0, 7);
  const plans = [];
  for (const [index, startPeriod] of [current, earlier, earlier].entries()) {
    const plan = await cash.create({
      accountId: account.id,
      name: `隔离现金计划-${index}`,
      expectedAmount: '100',
      dayOfMonth: 1,
      timezone: 'Asia/Shanghai',
      startPeriod,
    });
    plans.push(plan);
  }
  await prisma.recurringCashDepositPlan.update({
    where: { id: plans[2].id },
    data: { status: 'PAUSED', nextDueAt: null },
  });
  return { active: plans.slice(0, 2).map((plan) => plan.id), paused: plans[2].id };
}

const watchdog = setTimeout(() => {
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  console.error('专用进程验收超过 45 秒，已终止本入口创建的子进程');
  process.exit(1);
}, 45_000);
try {
  const [identity] = await prisma.$queryRawUnsafe(
    'SELECT current_database() AS database, current_user AS owner',
  );
  assert.equal(identity.database, 'automation_process_fixture');
  assert.equal(identity.owner, 'fixture_owner');
  // current baseline 包含现金单例与已到期估值种子；只在独立验收库停用后逐项启用目标。
  await prisma.automationJob.updateMany({ data: { enabled: false } });
  const results = [
    await scenario('cash-deposit-materialization', true),
    await scenario('provider-health', false),
  ];
  console.log(
    JSON.stringify({
      isolated: true,
      database: identity.database,
      owner: identity.owner,
      results,
      upstreamRequests: 0,
      aiGenerations: 0,
    }),
  );
} finally {
  for (const child of children) await stop(child);
  await prisma.$disconnect();
  clearTimeout(watchdog);
}
