import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

let raw = '';
for await (const part of process.stdin) raw += part;
const input = JSON.parse(raw);
assert.match(input.token, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u);
assert.equal(process.env.THESIS_LEDGER_CASH_NOTIFICATION_MOCK_TOKEN, input.token);
const suffix = input.token.replaceAll('-', '').slice(0, 8);
const database = new URL(input.databaseUrl);
const cache = new URL(input.redisUrl);
assert.equal(database.hostname, `ledger-cash-notice-pg-${suffix}`);
assert.equal(database.pathname, '/cash_notification_fixture');
assert.equal(database.username, 'fixture_owner');
assert.equal(cache.hostname, `ledger-cash-notice-redis-${suffix}`);
assert.equal(cache.pathname, '/0');
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: input.databaseUrl,
  REDIS_URL: input.redisUrl,
  DSA_BASE_URL: 'http://127.0.0.1:1',
  THESIS_LEDGER_DSA_TOKEN: 'mock-fixture-only',
  CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  CREDENTIAL_ENCRYPTION_KEY_VERSION: 'mock-fixture-v1',
  CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS: '',
});
console.log(JSON.stringify({ event: 'cash-mock-started', pid: process.pid }));
const watchdog = setTimeout(() => {
  console.error('模拟通知运行超过30秒上限');
  process.exit(1);
}, 30000);
const require = createRequire('/app/apps/server/package.json');
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: input.databaseUrl } } });
const moduleAt = async (name) => import(`/app/apps/server/dist/src/${name}.js`);
const [
  { NotificationService },
  { NotificationDispatcher },
  { ProviderHealthService },
  { RedisService, redisKey },
  { encryptProviderCredential },
  { RecurringCashDepositService },
  { scheduledForPeriod },
  { buildRecurringCashDepositNotification },
  { AutomationRuntimeHandlers },
] = await Promise.all([
  moduleAt('notifications/notification.service'),
  moduleAt('notifications/notification.dispatcher'),
  moduleAt('providers/provider-health.service'),
  moduleAt('platform/redis.service'),
  moduleAt('platform/credential-security'),
  moduleAt('cash-plans/recurring-cash-deposit.service'),
  moduleAt('cash-plans/recurring-cash-deposit.schedule'),
  moduleAt('cash-plans/recurring-cash-deposit-notification'),
  moduleAt('automation/automation-runtime.service'),
]);
const redis = new RedisService();
const originalFetch = globalThis.fetch;
const webhook = `https://open.feishu.cn/open-apis/bot/v2/hook/cash-mock-${suffix}`;
const providerName = `mock-cash-notification-${suffix}`;
const receipts = [];
const receiverErrors = [];
const blockedRequests = [];
const cases = new Map();
let receiver;

function responseFor(kind, attempt) {
  if (kind === 'exhausted' || (kind === 'retry-503' && attempt === 1))
    return { status: 503, body: { code: 503, msg: 'mock-unavailable' } };
  if (kind === 'business-error' && attempt === 1)
    return { status: 200, body: { code: 19002, msg: 'mock-business-rejection' } };
  return { status: 200, body: { code: 0, msg: 'mock-accepted' } };
}

const receiverServer = createServer(async (req, res) => {
  try {
    assert.equal(req.socket.remoteAddress, '127.0.0.1');
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/cash-notification');
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      assert(body.length < 16384);
    }
    const wire = JSON.parse(body);
    assert.equal(wire.msg_type, 'text');
    assert.equal(typeof wire.content.text, 'string');
    const entry = [...cases.values()].find((candidate) =>
      wire.content.text.startsWith(candidate.planName),
    );
    assert.ok(entry, '接收端只接受本次计划的消息');
    const attempt = receipts.filter((row) => row.kind === entry.kind).length + 1;
    const response = responseFor(entry.kind, attempt);
    receipts.push({
      kind: entry.kind,
      attempt,
      receivedAt: new Date().toISOString(),
      wire,
      response,
    });
    res.writeHead(response.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(response.body));
  } catch (error) {
    receiverErrors.push(error.message);
    res.writeHead(500);
    res.end('mock-receiver-rejected');
  }
});

function monthOffset(period, offset) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}

try {
  const [identity] = await prisma.$queryRawUnsafe(
    'SELECT current_database() AS database,current_user AS owner',
  );
  assert.deepEqual(identity, { database: 'cash_notification_fixture', owner: 'fixture_owner' });
  const available = new Set(
    (await prisma.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public'")).map(
      (row) => row.tablename,
    ),
  );
  const expected = new Set([
    ...Prisma.dmmf.datamodel.models.map((model) => model.dbName ?? model.name),
    ...input.rawOwned,
  ]);
  assert.deepEqual(
    [...expected].filter((name) => !available.has(name)),
    [],
    '隔离库缺少当前结构表',
  );
  await redis.ping();
  await new Promise((resolve, reject) => {
    receiverServer.once('error', reject);
    receiverServer.listen(0, '127.0.0.1', resolve);
  });
  receiver = `http://127.0.0.1:${receiverServer.address().port}/cash-notification`;
  globalThis.fetch = async (url, init) => {
    if (String(url) !== webhook || init?.method !== 'POST' || init?.redirect !== 'error') {
      blockedRequests.push({ method: init?.method, allowed: false });
      throw new Error('隔离通知禁止非本次模拟传输');
    }
    return originalFetch(receiver, init);
  };
  const health = new ProviderHealthService(prisma, {});
  const notifications = new NotificationService(prisma, redis, health);
  const dispatchers = [
    new NotificationDispatcher(notifications, prisma),
    new NotificationDispatcher(notifications, prisma),
  ];
  const cash = new RecurringCashDepositService(prisma, {}, notifications);
  const handlers = new AutomationRuntimeHandlers(prisma, {}, {}, {}, {}, cash, {});
  const handler = handlers.for('cash-deposit-materialization');
  const asOf = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(asOf);
  const latestPeriod = scheduledForPeriod(parts, 1) <= asOf ? parts : monthOffset(parts, -1);
  const account = await prisma.account.create({
    data: {
      name: '模拟通知隔离现金账户',
      type: 'cash',
      mode: 'actual',
      currency: 'CNY',
      active: true,
    },
  });
  const resultCases = [];
  async function runCase(kind, months) {
    const planName = `[模拟通知验收]${kind}-${suffix}`;
    const plan = await cash.create({
      accountId: account.id,
      name: planName,
      expectedAmount: '100',
      dayOfMonth: 1,
      timezone: 'Asia/Shanghai',
      startPeriod: monthOffset(latestPeriod, 1 - months),
    });
    cases.set(plan.id, { planName, kind });
    const scan = await handler.run(AbortSignal.timeout(10000), asOf, 'scheduled');
    const materialized = scan.results.find((row) => row.planId === plan.id);
    assert.equal(materialized.createdCount, months);
    const occurrences = await prisma.recurringCashDepositOccurrence.findMany({
      where: { planId: plan.id },
      orderBy: { periodKey: 'asc' },
    });
    assert.equal(occurrences.length, months);
    assert(occurrences.every((row) => row.status === 'PENDING'));
    const deliveryRows = await prisma.notificationDelivery.findMany({
      where: { subjectId: plan.id },
    });
    if (kind === 'unconfigured') {
      assert.equal(materialized.notificationQueued, false);
      assert.equal(deliveryRows.length, 0);
      resultCases.push({
        kind,
        planId: plan.id,
        occurrences: months,
        periods: materialized.periods,
        queued: false,
        receivedRequests: 0,
      });
      return;
    }
    assert.equal(materialized.notificationQueued, true);
    assert.equal(deliveryRows.length, 1);
    const deliveryId = deliveryRows[0].id;
    const states = [{ status: deliveryRows[0].status, attemptCount: 0 }];
    let delivery;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      delivery = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
      await delay(Math.max(0, delivery.scheduledAt.getTime() - Date.now()) + 25);
      await Promise.all(dispatchers.map((dispatcher) => dispatcher.runNow()));
      delivery = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
      assert.equal(delivery.attemptCount, attempt);
      states.push({
        status: delivery.status,
        attemptCount: delivery.attemptCount,
        errorCode: delivery.errorCode,
        scheduledAt: delivery.scheduledAt,
        deliveredAt: delivery.deliveredAt,
      });
      if (delivery.status !== 'retrying') break;
    }
    let expectedAttempts = 2;
    if (kind === 'normal') {
      expectedAttempts = 1;
    } else if (kind === 'exhausted') {
      expectedAttempts = 3;
    }
    assert.equal(delivery.attemptCount, expectedAttempts);
    assert.equal(delivery.status, kind === 'exhausted' ? 'failed' : 'delivered');
    if (kind === 'retry-503' || kind === 'exhausted')
      assert.equal(states[1].errorCode, 'feishu_http_503');
    if (kind === 'business-error') assert.equal(states[1].errorCode, 'feishu_business_19002');
    if (delivery.status === 'delivered') {
      assert.equal(delivery.lastError, null);
      assert.equal(delivery.errorCode, null);
      assert.ok(delivery.deliveredAt);
    }
    const beforeReceipts = receipts.filter((row) => row.kind === kind);
    assert.equal(beforeReceipts.length, expectedAttempts);
    const expectedMessage = buildRecurringCashDepositNotification({
      planId: plan.id,
      planName,
      periods: materialized.periods,
      traceId: 'only-content-check',
    });
    for (const receipt of beforeReceipts)
      assert.equal(
        receipt.wire.content.text,
        `${expectedMessage.message.title}\n${expectedMessage.message.body}`,
      );
    await redis.client.del(
      redisKey('cache', `notification:feishu:${expectedMessage.subject.dedupKey}`),
    );
    await Promise.all([
      handler.run(AbortSignal.timeout(10000), asOf, 'scheduled'),
      handler.run(AbortSignal.timeout(10000), asOf, 'scheduled'),
    ]);
    await Promise.all(dispatchers.map((dispatcher) => dispatcher.runNow()));
    assert.equal(
      receipts.filter((row) => row.kind === kind).length,
      expectedAttempts,
      '重复扫描或竞争投递产生重复请求',
    );
    assert.equal(await prisma.notificationDelivery.count({ where: { subjectId: plan.id } }), 1);
    assert.equal(
      await prisma.recurringCashDepositOccurrence.count({ where: { planId: plan.id } }),
      months,
    );
    resultCases.push({
      kind,
      planId: plan.id,
      deliveryId,
      occurrences: months,
      periods: materialized.periods,
      states,
      finalStatus: delivery.status,
      attempts: expectedAttempts,
      receivedRequests: beforeReceipts.length,
      successfulReceipts: beforeReceipts.filter(
        (row) => row.response.status === 200 && row.response.body.code === 0,
      ).length,
      rescanAndRaceAddedRequests: 0,
    });
  }

  assert.deepEqual(await notifications.routing(), { routes: [] });
  await runCase('unconfigured', 3);
  await prisma.providerConfig.create({
    data: {
      name: providerName,
      type: 'notification',
      enabled: true,
      priority: 1,
      capabilities: [],
      encryptedCredentials: encryptProviderCredential(webhook),
    },
  });
  assert.deepEqual(await notifications.routing(), {
    routes: [{ channel: 'feishu', provider: providerName }],
  });
  await runCase('normal', 1);
  await runCase('retry-503', 3);
  await runCase('business-error', 3);
  await runCase('exhausted', 3);
  assert.equal(await prisma.ledgerEvent.count(), 0);
  assert.equal(await prisma.recurringCashDepositOccurrence.count(), 13);
  assert.equal(await prisma.notificationDelivery.count(), 4);
  assert.equal(receipts.length, 8);
  assert.deepEqual(receiverErrors, []);
  assert.deepEqual(blockedRequests, []);
  const healthHistory = await prisma.providerHealthCheck.findMany({
    where: { provider: providerName },
    orderBy: { checkedAt: 'asc' },
  });
  assert.equal(healthHistory.length, 8);
  assert(healthHistory.every((row) => row.source === 'delivery'));
  console.log(
    JSON.stringify({
      assertionsPassed: true,
      isolated: true,
      identity,
      expectedTables: expected.size,
      cases: resultCases,
      receipts,
      mockHttpRequests: receipts.length,
      realExternalHttpRequests: 0,
      modelCalls: 0,
      fees: 0,
      ledgerEvents: 0,
      pendingOccurrences: 13,
      notificationDeliveries: 4,
      healthChecks: healthHistory.length,
      receiverErrors,
      blockedRequests,
      simulatedProvider: true,
      realFeishuDelivery: false,
    }),
  );
} finally {
  globalThis.fetch = originalFetch;
  if (receiverServer.listening) {
    receiverServer.closeAllConnections();
    await new Promise((resolve) => receiverServer.close(resolve));
  }
  await redis.onModuleDestroy();
  await prisma.$disconnect();
  clearTimeout(watchdog);
}
