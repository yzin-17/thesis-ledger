import {
  CnNavSimulation,
  deterministicResultChecksum,
  type CnNavRequest,
  type CnNavSimulationEvent,
  type FrozenNavExecutionModelSegment,
} from '@thesis-ledger/domain';
import { adaptNavDomainInputsV3 } from './backtest-nav-domain-input.js';
import {
  compareNavOfflineTime,
  navOfflineConfirmation,
  navOfflineCutoff,
  navOfflineEventVisible,
  navOfflineEventIssue,
  navOfflineExecutionDay,
  navOfflineSettlements,
  type NavOfflineEvent,
} from './backtest-nav-offline-events.js';
import { valueNavOfflineResult } from './backtest-nav-offline-valuation.js';

/** 只消费冻结读回和显式申请；不访问 Reader、队列、数据库或实时钟。 */
export const runNavOfflineV3 = (
  frozen: Parameters<typeof adaptNavDomainInputsV3>[0],
  requests: readonly CnNavRequest[],
  options: { through?: string; signal?: AbortSignal } = {},
) => {
  const input = adaptNavDomainInputsV3(frozen);
  const endAt = `${input.plan.runWindow.endDate}T${frozen.context.runConfig.valuationPolicy.dailyValuationTime}:00+08:00`;
  const through = options.through ?? endAt;
  if (
    compareNavOfflineTime(through, endAt) > 0 ||
    compareNavOfflineTime(through, input.config.dataAsOf!) > 0
  ) {
    throw new Error('NAV 离线评估不能超过冻结时点或期末');
  }
  const simulation = new CnNavSimulation(input.config);
  const initialState = simulation.snapshot();
  const queue: NavOfflineEvent[] = structuredClone(requests).map((request) => ({
    phase: 0,
    evaluationAt: request.availableAt,
    event: { type: 'request', payload: request },
  }));
  const segments = new Map<string, FrozenNavExecutionModelSegment>();
  const events: NavOfflineEvent[] = [];
  const rejects: { eventId: string; requestId?: string; code: string; reason: string }[] = [];
  while (queue.length) {
    if (options.signal?.aborted) throw new Error('NAV 离线执行已取消');
    queue.sort(
      (a, b) =>
        compareNavOfflineTime(a.evaluationAt, b.evaluationAt) ||
        a.phase - b.phase ||
        a.event.payload.eventId.localeCompare(b.event.payload.eventId),
    );
    const item = queue.shift()!;
    if (compareNavOfflineTime(item.evaluationAt, through) > 0) break;
    const event = item.event;
    const id = event.payload.requestId;
    const issue = navOfflineEventIssue(input, item);
    if (issue) {
      rejects.push({
        eventId: event.payload.eventId,
        requestId: id,
        ...issue,
      });
      continue;
    }
    if (event.type === 'nav') {
      const visible = input.pricingFactAt(event.payload.fact.valuationDate, item.evaluationAt);
      if (!visible) throw new Error('NAV 事件尚未按微秒可见');
      event.payload.fact = visible;
    }
    const result = simulation.applyEvent(event, item.evaluationAt);
    if (!result.applied) {
      rejects.push({
        eventId: result.eventId,
        ...(result.requestId ? { requestId: result.requestId } : {}),
        code: result.code,
        reason: result.reason,
      });
      continue;
    }
    events.push(item);
    if (event.type === 'request') {
      const { item: cutoff, segment } = navOfflineCutoff(input, event.payload);
      segments.set(id, segment);
      queue.push(cutoff);
    } else if (event.type === 'cutoff') {
      const candidate = input.facts.find(
        (fact) => fact.valuationDate === event.payload.valuationDate,
      );
      if (candidate) {
        const at =
          compareNavOfflineTime(candidate.availableAt, item.evaluationAt) >= 0
            ? candidate.availableAt
            : item.evaluationAt;
        queue.push({
          phase: 2,
          evaluationAt: at,
          event: {
            type: 'nav',
            payload: { eventId: `${id}:nav`, requestId: id, fact: candidate },
          },
        });
      }
    } else if (event.type === 'nav') {
      queue.push(
        navOfflineConfirmation(
          input,
          id,
          segments.get(id)!,
          event.payload.fact.valuationDate,
          item.evaluationAt,
        ),
      );
    } else if (event.type === 'confirmation') {
      const request = simulation.snapshot().requests.find((value) => value.requestId === id)!;
      queue.push(...navOfflineSettlements(input, request, segments.get(id)!));
    }
  }
  const state = simulation.snapshot();
  const payload = {
    runId: frozen.manifest.runId,
    snapshotId: frozen.manifest.contentHash,
    inputKind: 'nav' as const,
    through,
    state,
    events,
    rejects,
    pendingRequests: state.requests.filter(
      (request) => !['settled', 'cancelled', 'rejected'].includes(request.status),
    ),
    visibilityDisclosure: input.visibilityDisclosure,
    ...valueNavOfflineResult(input, initialState, state, through),
  };
  return { ...payload, resultChecksum: deterministicResultChecksum(payload) };
};

export const replayNavOfflineEvents = (
  frozen: Parameters<typeof adaptNavDomainInputsV3>[0],
  events: readonly NavOfflineEvent[],
) => {
  const input = adaptNavDomainInputsV3(frozen);
  const simulation = new CnNavSimulation(input.config);
  const endAt = `${input.plan.runWindow.endDate}T${frozen.context.runConfig.valuationPolicy.dailyValuationTime}:00+08:00`;
  let previousAt: string | undefined;
  for (const item of events) {
    const event: CnNavSimulationEvent = structuredClone(item.event);
    if (
      compareNavOfflineTime(item.evaluationAt, endAt) > 0 ||
      compareNavOfflineTime(item.evaluationAt, input.config.dataAsOf!) > 0 ||
      (previousAt && compareNavOfflineTime(previousAt, item.evaluationAt) > 0)
    ) {
      throw new Error('NAV 重放时序超出冻结执行边界');
    }
    if (event.type === 'request' && !navOfflineExecutionDay(input, event.payload.requestAt)) {
      throw new Error('NAV 重放申请超出执行处理日');
    }
    if (event.type === 'nav') {
      const fact = input.pricingFactAt(event.payload.fact.valuationDate, item.evaluationAt);
      if (!fact) throw new Error('NAV 重放事实尚不可见');
      event.payload.fact = fact;
    }
    if (!navOfflineEventVisible({ ...item, event })) throw new Error('NAV 重放事件尚不可见');
    const result = simulation.applyEvent(event, item.evaluationAt);
    if (!result.applied) throw new Error(`NAV 重放失败：${result.code}`);
    previousAt = item.evaluationAt;
  }
  return simulation.snapshot();
};
