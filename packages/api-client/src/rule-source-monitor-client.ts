import {
  ruleMonitorStatusSchema,
  ruleMonitorJobResponseSchema,
  ruleMonitorVersionsSchema,
  ruleMonitorConfigResponseSchema,
  ruleMonitorConfigureSchema,
  ruleMonitorCheckSchema,
  ruleMonitorJobIdSchema,
  ruleMonitorTaskSchema,
  ruleMonitorScheduleSchema,
  ruleMonitorVersionRequestSchema,
  ruleMonitorVersionDetailSchema,
  type RuleMonitorVersionRequest,
  type RuleMonitorConfigure,
  type RuleMonitorCheck,
  type RuleMonitorTask,
  type RuleMonitorSchedule,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';
import { ThesisLedgerContractError } from './api-error.js';

const root = '/api/market-data/rule-monitor';
export function ruleSourceMonitorClient(request: ParsedRequest) {
  return {
    getRuleMonitorVersion: (input: RuleMonitorVersionRequest, signal?: AbortSignal) => {
      const parsed = ruleMonitorVersionRequestSchema.parse(input);
      const params = new URLSearchParams({
        kind: parsed.kind,
        identity: parsed.identity,
        contentHash: parsed.contentHash,
      });
      if (parsed.baseHash) params.set('baseHash', parsed.baseHash);
      return request(`${root}/version?${params}`, ruleMonitorVersionDetailSchema, {
        cache: 'no-store',
        signal: signal ?? null,
      }).then((result) => {
        if (
          result.kind !== parsed.kind ||
          result.identity !== parsed.identity ||
          result.contentHash !== parsed.contentHash ||
          (result.comparison?.baseHash ?? undefined) !== parsed.baseHash
        )
          throw new ThesisLedgerContractError(root);
        return result;
      });
    },
    getRuleMonitor: (signal?: AbortSignal) =>
      request(root, ruleMonitorStatusSchema, { cache: 'no-store', signal: signal ?? null }),
    createRuleMonitorTask: (input: RuleMonitorTask) =>
      request(`${root}/task`, ruleMonitorConfigResponseSchema, {
        method: 'POST',
        body: JSON.stringify(ruleMonitorTaskSchema.parse(input)),
      }).then((result) => {
        if (
          !result.config.taskCreated ||
          result.config.revision !== input.expectedRevision + 1 ||
          JSON.stringify(result.config.sourceIds) !== JSON.stringify(input.sourceIds)
        )
          throw new ThesisLedgerContractError(root);
        return result;
      }),
    updateRuleMonitorSchedule: (input: RuleMonitorSchedule) =>
      request(`${root}/schedule`, ruleMonitorConfigResponseSchema, {
        method: 'PUT',
        body: JSON.stringify(ruleMonitorScheduleSchema.parse(input)),
      }).then((result) => {
        if (
          result.config.revision !== input.expectedRevision + 1 ||
          result.config.cron !== input.cron ||
          result.config.timezone !== input.timezone
        )
          throw new ThesisLedgerContractError(root);
        return result;
      }),
    configureRuleMonitor: (input: RuleMonitorConfigure) =>
      request(`${root}/config`, ruleMonitorConfigResponseSchema, {
        method: 'PUT',
        body: JSON.stringify(ruleMonitorConfigureSchema.parse(input)),
      }).then((result) => {
        if (
          result.config.revision !== input.expectedRevision + 1 ||
          result.config.enabled !== input.enabled ||
          JSON.stringify(result.config.sourceIds) !== JSON.stringify(input.sourceIds)
        )
          throw new ThesisLedgerContractError(root);
        return result;
      }),
    checkRuleSources: (input: RuleMonitorCheck) =>
      request(`${root}/checks`, ruleMonitorJobResponseSchema, {
        method: 'POST',
        body: JSON.stringify(ruleMonitorCheckSchema.parse(input)),
      }).then((result) => {
        if (
          result.run.id !== input.requestId ||
          JSON.stringify(result.run.sourceIds) !== JSON.stringify(input.sourceIds)
        )
          throw new ThesisLedgerContractError(root);
        return result;
      }),
    getRuleMonitorJob: (identity: string, signal?: AbortSignal) =>
      request(
        `${root}/checks/${encodeURIComponent(ruleMonitorJobIdSchema.parse(identity))}`,
        ruleMonitorJobResponseSchema,
        { cache: 'no-store', signal: signal ?? null },
      ).then((result) => {
        if (result.run.id !== identity) throw new ThesisLedgerContractError(root);
        return result;
      }),
    getRuleMonitorVersions: (kind: 'pack' | 'document', identity: string, signal?: AbortSignal) =>
      request(
        `${root}/versions?${new URLSearchParams({ kind, identity })}`,
        ruleMonitorVersionsSchema,
        { cache: 'no-store', signal: signal ?? null },
      ).then((result) => {
        if (result.kind !== kind || result.identity !== identity)
          throw new ThesisLedgerContractError(root);
        return result;
      }),
  };
}
