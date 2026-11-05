import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { readExperimentHistory } from './research-live-experiment-checkpoint.mjs';

export function setup(cloudflare = false) {
  const root = mkdtempSync(resolve('.recovery-artifacts/continuation-test-'));
  const parent = join(root, 'parent');
  const source = join(root, 'source');
  mkdirSync(parent);
  mkdirSync(source);
  const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const old = {
    version: 'research-live-experiment-v2',
    model: { providerId: 'cloudflare', id: 'old' },
    pricing: { costPer1kInput: 0.00045, costPer1kOutput: 0.0032, costCurrency: 'USD' },
    budget: { maxInputTokensPerArm: 100000, maxOutputTokensPerArm: 6000 },
    benchmarkFingerprint: 'b'.repeat(64),
    evaluationFingerprint: 'e'.repeat(64),
  };
  const protocol = {
    ...old,
    version: 'research-live-experiment-v3',
    model: { providerId: 'openrouter', id: 'fixed:free' },
    pricing: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
    caseIds: ['first'],
  };
  if (cloudflare) {
    protocol.version = 'research-live-experiment-v4';
    protocol.model = { providerId: 'cloudflare', id: '@cf/qwen/qwen3.8-27b' };
    protocol.pricing = old.pricing;
    protocol.caseIds = [
      'single-price',
      'currencies',
      'future-publication',
      'dividend-proposal',
      'prompt-injection',
    ];
  }
  const initialRequests = cloudflare ? 48 : 2;
  const caseId = protocol.caseIds[0];
  const write = (directory, name, value) =>
    writeFileSync(join(directory, name), JSON.stringify(value));
  write(parent, 'result.json', {
    protocol: old,
    protectedUnchanged: true,
    completedAt: new Date().toISOString(),
    realRequestsTotal: initialRequests,
    report: {
      cases: [
        {
          single: {
            requests: Array.from({ length: initialRequests - 1 }, (_, index) => ({
              requestId: 'old-' + index,
              facts: [
                {
                  cost: { status: 'estimated', amount: index === 0 ? '0.1' : '0', currency: 'USD' },
                },
              ],
            })),
          },
          staged: {
            requests: [
              { requestId: 'old-unknown', facts: [{ cost: { status: 'unknown', amount: null } }] },
            ],
          },
        },
      ],
      budget: { spent: '0.1' },
    },
  });
  const previous = readExperimentHistory(parent, protocol, fingerprint);
  const request = { requestId: 'new-1', facts: [{ cost: { status: 'unknown', amount: null } }] };
  const single = { status: 'failed', reason: 'provider_rejected', requests: [request] };
  const staged = { status: 'blocked', reason: 'unknown_outcome', requests: [] };
  const entry = { caseId, single, staged };
  const inputs = {
    benchmarkSha256: 'b'.repeat(64),
    evaluationSha256: 'e'.repeat(64),
    target: { protected: true },
  };
  const sealed = {
    ...inputs,
    protocol,
    initialBudget: {
      amount: previous.history.amount,
      reservedUnknown: previous.history.reservedUnknown,
      requests: initialRequests,
    },
  };
  const result = {
    pid: 2000000000,
    wireRequests: 1,
    resumedFrom: null,
    protocol,
    protectedUnchanged: true,
    before: inputs.target,
    after: inputs.target,
    completedAt: new Date().toISOString(),
    historicalBudgetFrom: previous.sourceProof,
    realRequestsTotal: initialRequests + 1,
    report: {
      protocolFingerprint: fingerprint(protocol),
      benchmarkFingerprint: protocol.benchmarkFingerprint,
      evaluationFingerprint: protocol.evaluationFingerprint,
      cases: [entry],
      actualModelRequests: 1,
      reusedRequests: 0,
      priorUnknownRequests: [],
      historicalBudget: previous.history,
      budget: {
        stopped: 'unknown_outcome',
        requests: initialRequests + 1,
        spent: '0.1',
        committed: cloudflare ? '0.2284' : '0.1642',
        reservedUnknown: cloudflare ? '0.1284' : '0.0642',
      },
    },
  };
  const journal = [{ caseId, arm: 'single', phase: 'settled', request, output: null }];
  const http = [{ requestId: 'new-1', status: 429, ...(cloudflare ? { errorCodes: [4006] } : {}) }];
  const save = () => {
    write(source, 'sealed-inputs.json', sealed);
    write(source, 'result.json', result);
    write(source, 'arms.json', [
      { caseId, arm: 'single', result: single },
      { caseId, arm: 'staged', result: staged },
    ]);
    write(source, 'request-journal.json', journal);
    write(source, 'http-status.json', http);
  };
  save();
  return { root, source, protocol, fingerprint, inputs, result, sealed, journal, http, save };
}
