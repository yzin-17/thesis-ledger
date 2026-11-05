import { readFileSync, writeFileSync, renameSync, openSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { readFreeProbeLedger } from './research-live-experiment-supplemental.mjs';

export function saveExperimentCheckpoint(directory, name, value) {
  if (!/^[a-z0-9-]+\.json$/.test(name)) throw new Error('检查点名称无效');
  const target = join(directory, name);
  const temporary = target + '.tmp-' + process.pid;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, target);
}
export function detachExperimentWorker(script, args, directory) {
  const fd = openSync(join(directory, 'worker.log'), 'a', 0o600);
  try {
    const child = spawn(process.execPath, [script, ...args], {
      detached: true,
      stdio: ['ignore', fd, fd],
      cwd: process.cwd(),
      env: process.env,
    });
    child.unref();
    const proof = { pid: child.pid, startedAt: new Date().toISOString(), script, args };
    saveExperimentCheckpoint(directory, 'worker.json', proof);
    return proof;
  } finally {
    closeSync(fd);
  }
}
export function readInterruptedExperiment(directory, benchmark, protocolFingerprint) {
  const source = resolve(directory);
  if (!source.startsWith(resolve('.recovery-artifacts') + '/'))
    throw new Error('接续来源必须属于本项目');
  const sealedBytes = readFileSync(join(source, 'sealed-inputs.json'));
  const armBytes = readFileSync(join(source, 'arms.json'));
  const proof = JSON.parse(readFileSync(join(source, 'interrupted-run.json'), 'utf8'));
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  if (
    proof.localProcessAbsent !== true ||
    hash(sealedBytes) !== proof.sealedInputsSha256 ||
    hash(armBytes) !== proof.retainedArmsSha256
  )
    throw new Error('原中断事实或封存摘要不符');
  const sealed = JSON.parse(sealedBytes);
  const completedArms = JSON.parse(armBytes);
  const progress = JSON.parse(readFileSync(join(source, 'progress.json'), 'utf8'));
  const recorded = completedArms.reduce((sum, entry) => sum + entry.result.requests.length, 0);
  const unknown = progress.wireRequests - recorded;
  if (unknown !== 1 || completedArms.length !== progress.completedArms)
    throw new Error('原中断请求计数不符合已核对范围');
  const sequence = benchmark.cases.flatMap((entry, index) =>
    (index % 2 === 0 ? ['single', 'staged'] : ['staged', 'single']).map((arm) => ({
      caseId: entry.id,
      arm,
    })),
  );
  const interrupted = sequence[completedArms.length];
  if (!interrupted) throw new Error('无法确定中断组');
  return {
    sealedProtocol: sealed.protocol,
    resume: {
      sourceProtocolFingerprint: protocolFingerprint(sealed.protocol),
      completedArms,
      unresolvedRequests: [{ ...interrupted, ordinal: progress.wireRequests, requestId: null }],
    },
    priorRequests: progress.wireRequests,
    sourceProof: {
      directory: source,
      sealedInputsSha256: hash(sealedBytes),
      retainedArmsSha256: hash(armBytes),
    },
  };
}

export function readExperimentHistory(directory, protocol, fingerprint) {
  const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
  const { Prisma } = require('@prisma/client');
  const ids = new Set();
  const supplementalIds = new Set();
  const visited = new Set();
  const read = (location) => {
    const source = resolve(location);
    if (
      !source.startsWith(resolve('.recovery-artifacts') + '/') ||
      visited.has(source) ||
      visited.size >= 10
    )
      throw new Error('历史预算来源越界、循环或过深');
    visited.add(source);
    const bytes = readFileSync(join(source, 'result.json'));
    const hash = createHash('sha256').update(bytes).digest('hex');
    const result = JSON.parse(bytes);
    if (result.protectedUnchanged !== true || !result.report || !result.completedAt)
      throw new Error('历史试跑缺少终态或保护核对');
    const prior = result.report;
    if (
      result.protocol.benchmarkFingerprint !== protocol.benchmarkFingerprint ||
      result.protocol.evaluationFingerprint !== protocol.evaluationFingerprint ||
      fingerprint(result.protocol) === fingerprint(protocol) ||
      (![
        'research-live-experiment-v3',
        'research-live-experiment-v4',
        'research-live-experiment-v5',
        'research-live-experiment-v6',
      ].includes(protocol.version) &&
        (fingerprint(result.protocol.model) !== fingerprint(protocol.model) ||
          fingerprint(result.protocol.pricing) !== fingerprint(protocol.pricing)))
    )
      throw new Error('历史模型、协议或固定集不符');
    let cost = new Prisma.Decimal(0);
    let unknown = prior.priorUnknownRequests?.length ?? 0;
    let requests = unknown;
    let reserved = new Prisma.Decimal(0);
    const lots = [];
    if (prior.historicalBudget) {
      const previous = result.historicalBudgetFrom;
      if (!previous?.directory) throw new Error('缺少上层预算来源');
      const parent = read(previous.directory).history;
      for (const key of [
        'sourceReportSha256',
        'sourceProtocolFingerprint',
        'amount',
        'reservedUnknown',
        'requests',
        'unknownRequests',
      ])
        if (parent[key] !== prior.historicalBudget[key]) throw new Error('上层预算摘要或金额不符');
      if (previous.sourceReportSha256 !== parent.sourceReportSha256)
        throw new Error('上层预算引用被修改');
      cost = new Prisma.Decimal(parent.amount).minus(parent.reservedUnknown);
      reserved = new Prisma.Decimal(parent.reservedUnknown);
      requests += parent.requests;
      lots.push(...parent.unknownReservations);
    }
    if (prior.supplementalBudget) {
      const supplemental = readFreeProbeLedger(result.supplementalBudgetFrom, ids);
      if (JSON.stringify(supplemental.budget) !== JSON.stringify(prior.supplementalBudget))
        throw new Error('历史补充预算或引用不符');
      requests += supplemental.requests;
      supplemental.budget.entries.forEach((entry) => supplementalIds.add(entry.requestId));
    }
    for (const entry of prior.cases)
      for (const arm of ['single', 'staged'])
        for (const request of entry[arm].requests) {
          if (ids.has(request.requestId)) throw new Error('历史请求重复');
          ids.add(request.requestId);
          requests++;
          const fact = request.facts.at(-1);
          if (fact.cost.status === 'unknown') {
            unknown++;
            continue;
          }
          if (fact.cost.currency !== 'USD' || fact.cost.amount === null)
            throw new Error('历史费用币种无效');
          const amount = new Prisma.Decimal(fact.cost.amount);
          if (!amount.isFinite() || amount.lt(0)) throw new Error('历史费用无效');
          cost = cost.plus(amount);
        }
    if (requests !== result.realRequestsTotal || !cost.eq(prior.budget.spent))
      throw new Error('历史费用与派发数无法对账');
    if (result.protocol.pricing.costCurrency !== 'USD') throw new Error('历史预留币种无效');
    if (unknown > 0) {
      const lot = {
        protocolFingerprint: fingerprint(result.protocol),
        currency: 'USD',
        maxInputTokens:
          result.protocol.budget.modelContextTokens ?? result.protocol.budget.maxInputTokensPerArm,
        maxOutputTokens:
          result.protocol.budget.modelContextTokens ?? result.protocol.budget.maxOutputTokensPerArm,
        costPer1kInput: result.protocol.pricing.costPer1kInput,
        costPer1kOutput: result.protocol.pricing.costPer1kOutput,
        unknownRequests: unknown,
      };
      lots.push(lot);
      reserved = reserved.plus(
        new Prisma.Decimal(lot.maxInputTokens)
          .mul(lot.costPer1kInput)
          .plus(new Prisma.Decimal(lot.maxOutputTokens).mul(lot.costPer1kOutput))
          .div(1000)
          .mul(unknown),
      );
    }
    return {
      history: {
        sourceProtocolFingerprint: fingerprint(result.protocol),
        sourceReportSha256: hash,
        model: result.protocol.model,
        pricingFingerprint: fingerprint(result.protocol.pricing),
        benchmarkFingerprint: result.protocol.benchmarkFingerprint,
        evaluationFingerprint: result.protocol.evaluationFingerprint,
        amount: cost.plus(reserved).toFixed(),
        reservedUnknown: reserved.toFixed(),
        requests,
        unknownRequests: lots.reduce((sum, lot) => sum + lot.unknownRequests, 0),
        unknownReservations: lots,
      },
      sourceProof: { directory: source, sourceReportSha256: hash },
    };
  };
  return { ...read(directory), requestIds: [...ids], supplementalRequestIds: [...supplementalIds] };
}
