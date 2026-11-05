import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

let raw = '';
for await (const part of process.stdin) raw += part;
const input = JSON.parse(raw);
assert.match(input.token, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u);
assert.equal(process.env.THESIS_LEDGER_CASH_NOTIFICATION_MOCK_TOKEN, input.token);
assert.equal(input.realRequestLimit, 1);
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
  THESIS_LEDGER_DSA_TOKEN: 'notification-fixture-only',
  CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  CREDENTIAL_ENCRYPTION_KEY_VERSION: 'notification-fixture-v1',
  CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS: '',
});
console.log(JSON.stringify({ event: 'cash-mock-started', pid: process.pid }));
const watchdog = setTimeout(() => {
  console.error('真实通知隔离程序超过30秒上限，不再发送');
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
  { assertAllowedFeishuWebhookUrl },
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
  moduleAt('providers/feishu-webhook-security'),
]);
const redis = new RedisService();
const originalFetch = globalThis.fetch;
const secretToken = new URL(input.webhook).pathname.split('/').at(-1);
const redact = (value) =>
  String(value)
    .replaceAll(input.webhook, '[已隐藏Webhook]')
    .replaceAll(secretToken, '[已隐藏令牌]');
const receipt = {
  assertionsPassed: false,
  isolated: true,
  simulatedProvider: false,
  realFeishuDelivery: false,
  recipient: 'FEISHU_HOOK绑定群',
  realRequestLimit: 1,
  realExternalHttpRequests: 0,
  modelCalls: 0,
  fees: 0,
  responses: [],
  blockedRequests: 0,
};

function monthOffset(period, offset) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}

try {
  assertAllowedFeishuWebhookUrl(input.webhook);
  const [identity] = await prisma.$queryRawUnsafe(
    'SELECT current_database() AS database,current_user AS owner',
  );
  assert.deepEqual(identity, { database: 'cash_notification_fixture', owner: 'fixture_owner' });
  receipt.identity = identity;
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
  );
  receipt.expectedTables = expected.size;
  await redis.ping();
  const health = new ProviderHealthService(prisma, {});
  const notifications = new NotificationService(prisma, redis, health);
  const dispatchers = [
    new NotificationDispatcher(notifications, prisma),
    new NotificationDispatcher(notifications, prisma),
  ];
  const cash = new RecurringCashDepositService(prisma, {}, notifications);
  const handler = new AutomationRuntimeHandlers(prisma, {}, {}, {}, {}, cash, {}).for(
    'cash-deposit-materialization',
  );
  const asOf = new Date();
  const currentPeriod = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(asOf);
  const latest =
    scheduledForPeriod(currentPeriod, 1) <= asOf ? currentPeriod : monthOffset(currentPeriod, -1);
  const provider = `feishu-cash-acceptance-${suffix}`;
  assert.deepEqual(await notifications.routing(), { routes: [] });
  await prisma.providerConfig.create({
    data: {
      name: provider,
      type: 'notification',
      enabled: true,
      priority: 1,
      capabilities: [],
      encryptedCredentials: encryptProviderCredential(input.webhook),
    },
  });
  assert.deepEqual(await notifications.routing(), { routes: [{ channel: 'feishu', provider }] });
  const account = await prisma.account.create({
    data: {
      name: '通知验收隔离现金账户',
      type: 'cash',
      mode: 'actual',
      currency: 'CNY',
      active: true,
    },
  });
  const plan = await cash.create({
    accountId: account.id,
    name: '[ThesisLedger 通知验收]隔离样本（非实际到账）',
    expectedAmount: '100',
    dayOfMonth: 1,
    timezone: 'Asia/Shanghai',
    startPeriod: monthOffset(latest, -2),
  });
  const scan = await handler.run(AbortSignal.timeout(10000), asOf, 'scheduled');
  const materialized = scan.results.find((row) => row.planId === plan.id);
  assert.equal(materialized.createdCount, 3);
  assert.equal(materialized.notificationQueued, true);
  const rows = await prisma.notificationDelivery.findMany({ where: { subjectId: plan.id } });
  assert.equal(rows.length, 1);
  const message = buildRecurringCashDepositNotification({
    planId: plan.id,
    planName: plan.name,
    periods: materialized.periods,
    traceId: 'notification-acceptance-content',
  });
  const expectedWire = {
    msg_type: 'text',
    content: { text: `${message.message.title}\n${message.message.body}` },
  };
  receipt.planId = plan.id;
  receipt.deliveryId = rows[0].id;
  receipt.periods = materialized.periods;
  receipt.message = expectedWire;
  receipt.initialState = { status: rows[0].status, attemptCount: rows[0].attemptCount };
  console.log(
    JSON.stringify({
      event: 'feishu-message-prepared',
      message: expectedWire,
      periods: materialized.periods,
    }),
  );
  globalThis.fetch = async (url, init) => {
    if (
      String(url) !== input.webhook ||
      init?.method !== 'POST' ||
      init?.redirect !== 'error' ||
      receipt.realExternalHttpRequests >= 1
    ) {
      receipt.blockedRequests += 1;
      throw new Error('只允许本次既定飞书Webhook的一次POST');
    }
    assert.deepEqual(JSON.parse(init.body), expectedWire);
    receipt.realExternalHttpRequests += 1;
    const startedAt = Date.now();
    const response = await originalFetch(url, init);
    const body = await response.clone().text();
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = {};
    }
    const responseSummary = {};
    for (const key of ['code', 'msg', 'StatusCode', 'StatusMessage']) {
      if (['string', 'number'].includes(typeof parsed?.[key]))
        responseSummary[key] = redact(parsed[key]).slice(0, 200);
    }
    receipt.responses.push({
      status: response.status,
      response: responseSummary,
      durationMs: Date.now() - startedAt,
    });
    return response;
  };
  await Promise.all(dispatchers.map((dispatcher) => dispatcher.runNow()));
  const delivery = await prisma.notificationDelivery.findUniqueOrThrow({
    where: { id: rows[0].id },
  });
  receipt.finalState = {
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    errorCode: delivery.errorCode,
    deliveredAt: delivery.deliveredAt,
  };
  assert.equal(receipt.realExternalHttpRequests, 1);
  assert.equal(receipt.responses.length, 1);
  assert.equal(receipt.responses[0].status, 200);
  const ack = receipt.responses[0].response;
  assert.ok(Number(ack.code ?? ack.StatusCode ?? -1) === 0, '缺少明确的飞书业务成功回执');
  assert.equal(delivery.status, 'delivered', '真实发送未成功，立即停止且不重发');
  assert.equal(delivery.attemptCount, 1);
  assert.ok(delivery.deliveredAt);
  assert.equal(delivery.errorCode, null);
  await redis.client.del(redisKey('cache', `notification:feishu:${message.subject.dedupKey}`));
  await Promise.all([
    handler.run(AbortSignal.timeout(10000), asOf, 'scheduled'),
    handler.run(AbortSignal.timeout(10000), asOf, 'scheduled'),
  ]);
  await Promise.all(dispatchers.map((dispatcher) => dispatcher.runNow()));
  assert.equal(receipt.realExternalHttpRequests, 1);
  assert.equal(receipt.blockedRequests, 0);
  const occurrences = await prisma.recurringCashDepositOccurrence.findMany({
    where: { planId: plan.id },
  });
  assert.equal(occurrences.length, 3);
  assert(occurrences.every((row) => row.status === 'PENDING'));
  assert.equal(await prisma.notificationDelivery.count(), 1);
  assert.equal(await prisma.ledgerEvent.count(), 0);
  const history = await prisma.providerHealthCheck.findMany({ where: { provider } });
  assert.equal(history.length, 1);
  assert.equal(history[0].source, 'delivery');
  assert.equal(history[0].state, 'healthy');
  Object.assign(receipt, {
    assertionsPassed: true,
    realFeishuDelivery: true,
    pendingOccurrences: 3,
    notificationDeliveries: 1,
    healthChecks: 1,
    ledgerEvents: 0,
    rescanAndRaceAddedRequests: 0,
  });
} catch (error) {
  receipt.error = redact(error.message);
  process.exitCode = 1;
} finally {
  console.log(JSON.stringify(receipt));
  globalThis.fetch = originalFetch;
  await redis.onModuleDestroy();
  await prisma.$disconnect();
  clearTimeout(watchdog);
}
