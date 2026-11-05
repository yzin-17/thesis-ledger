import {
  ruleMonitorStatusSchema,
  ruleMonitorJobResponseSchema,
  ruleMonitorVersionsSchema,
  ruleMonitorConfigResponseSchema,
  ruleMonitorConfigureSchema,
  ruleMonitorCheckSchema,
  ruleMonitorJobIdSchema,
  type RuleMonitorConfigure,
  type RuleMonitorCheck,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';
import { ThesisLedgerContractError } from './api-error.js';

const root = '/api/market-data/rule-monitor';
export function ruleSourceMonitorClient(request: ParsedRequest) {
  return {
    getRuleMonitor: (signal?: AbortSignal) =>
      request(root, ruleMonitorStatusSchema, { cache: 'no-store', signal: signal ?? null }),
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
