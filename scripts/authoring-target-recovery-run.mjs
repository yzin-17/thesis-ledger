import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { main as recover } from '../../thesis-ledger-infra/scripts/authoring-target-recovery.mjs';
import {
  withMissingAuthoringDelivery,
  assertDeliveryTerminal,
} from '../../thesis-ledger-infra/scripts/authoring-target-delivery.mjs';
import { withUnavailableAuthoringQueue } from '../../thesis-ledger-infra/scripts/authoring-target-queue-outage.mjs';

const args = process.argv.slice(2);
assert.equal(args[0], '--confirm=thesis-ledger-dev/thesis_ledger');
assert(args.length <= 2);
if (args[1]) assert.match(args[1], /^--phase=(all|delivery|outage)$/);
const phase = args[1]?.replace(/^--phase=/, '') ?? 'all';
assert(['all', 'delivery', 'outage'].includes(phase));
const prefix = `nla6_${new Date().toISOString().slice(0, 10).replaceAll('-', '')}_${randomUUID().slice(0, 8)}.`;
const base = 'http://127.0.0.1:3000/api/v1';
const model = 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m';
let identity;
async function request(path, body, token = identity?.token, expectedStatus) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-thesis-ledger-session': token } : {}),
      ...(process.env.THESIS_LEDGER_LAN_TOKEN
        ? { authorization: `Bearer ${process.env.THESIS_LEDGER_LAN_TOKEN}` }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const data = response.status === 204 ? null : await response.json();
  if (expectedStatus !== undefined) {
    assert.equal(response.status, expectedStatus);
    return { status: response.status, body: data };
  }
  assert(response.ok, `恢复验收 API ${path}：HTTP ${response.status} ${JSON.stringify(data)}`);
  return data;
}
async function draft(label) {
  return request('/strategy-authoring/drafts', {
    title: label,
    description: '只编写单一ETF策略，请澄清标的、日线均线、仓位、止损与费用，全部条件尚未确认。',
    questions: [],
    requirements: [],
    runtimeIntents: [],
    removedRequirements: [],
    definitionText: '',
    manualChanges: [],
  });
}
const submit = (item) =>
  request(`/strategy-authoring/drafts/${item.id}/operations`, {
    kind: 'analyze',
    expectedRevision: item.revision,
    idempotencyKey: randomUUID(),
    providerId: 'lmstudio',
    model,
    intent: '',
    unknownCostAcknowledgedAt: null,
  });
try {
  const providers = await request('/ai/providers');
  const selected = providers.find((item) => item.name === 'lmstudio');
  assert(selected.enabled && selected.models.includes(model));
  assert.equal(selected.modelPricing[model].costPer1kInput, 0);
  assert.equal(selected.modelPricing[model].costPer1kOutput, 0);
  assert.equal(selected.modelPricing[model].costCurrency, 'USD');
  identity = await request('/identity/users', {
    username: `${prefix}recovery`,
    displayName: '编写恢复验收',
    password: randomBytes(24).toString('base64url'),
  });
  if (phase === 'all') {
    const first = await draft('编写在途恢复验收');
    const dispatched = await submit(first);
    await recover([
      '--confirm=thesis-ledger-dev/thesis_ledger',
      `--operation=${dispatched.id}`,
      `--owner-prefix=${prefix}`,
    ]);
    const recovered = await request(`/strategy-authoring/operations/${dispatched.id}`);
    assert.equal(recovered.status, 'failed');
    assert.equal(recovered.outcome.externalResult, 'unknown');
    await request(`/strategy-authoring/drafts/${first.id}/discard`, {
      expectedRevision: first.revision,
    });
  }
  if (phase !== 'outage') {
    const second = await draft('编写未派发补投验收');
    const delivery = await withMissingAuthoringDelivery(prefix, () => submit(second));
    const deadline = Date.now() + 180000;
    let terminal;
    while (Date.now() < deadline) {
      const row = await request(`/strategy-authoring/operations/${delivery.id}`);
      if (!['queued', 'running'].includes(row.status)) {
        terminal = row;
        break;
      }
      await delay(5000);
    }
    assert(terminal);
    assertDeliveryTerminal(terminal, model);
    await delay(31000);
    const stable = await request(`/strategy-authoring/operations/${delivery.id}`);
    assert.equal(stable.status, terminal.status);
    assert.equal(stable.invocations.length, 1);
    assert.equal(stable.attempt, 1);
    console.log(
      JSON.stringify({
        stage: '未派发补投验收完成',
        operationId: delivery.id,
        status: terminal.status,
        attempt: terminal.attempt,
        deliveryAttempts: terminal.deliveryAttempts,
        invocations: terminal.invocations.map((item) => ({
          requestId: item.requestId,
          facts: item.facts.map((fact) => ({ kind: fact.kind, details: fact.details })),
        })),
        outcome: { ...terminal.outcome, outputText: undefined },
      }),
    );
    await request(`/strategy-authoring/drafts/${second.id}/discard`, {
      expectedRevision: second.revision,
    });
  }
  if (phase !== 'delivery') {
    const third = await draft('编写队列不可用拒绝验收');
    await withUnavailableAuthoringQueue(prefix, () =>
      request(
        `/strategy-authoring/drafts/${third.id}/operations`,
        {
          kind: 'analyze',
          expectedRevision: third.revision,
          idempotencyKey: randomUUID(),
          providerId: 'lmstudio',
          model,
          intent: '',
          unknownCostAcknowledgedAt: null,
        },
        identity.token,
        503,
      ),
    );
    await request(`/strategy-authoring/drafts/${third.id}/discard`, {
      expectedRevision: third.revision,
    });
  }
} finally {
  if (identity) await request('/identity/session/revoke', {});
}
