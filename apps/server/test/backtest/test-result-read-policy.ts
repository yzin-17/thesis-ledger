import type { ResultReadEligibility } from '@thesis-ledger/schemas';
import { resultReadEligibilityForRun } from '@thesis-ledger/schemas';
import type { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';

const ordinaryEligibility = (): ResultReadEligibility =>
  resultReadEligibilityForRun({ associated: false, ordinaryFormal: true });

/** Unit tests that do not exercise reads still pass an explicit safe policy seam. */
export const testResultReadPolicy = () => {
  const protect = <T extends { id: string }>(job: T, known = ordinaryEligibility()) => ({
    ...job,
    readEligibility: known,
  });
  return {
    run: async () => ordinaryEligibility(),
    runs: async (ids: readonly string[]) => new Map(ids.map((id) => [id, ordinaryEligibility()])),
    protectBacktestJob: protect,
    protectBacktestJobs: async <T extends { id: string }>(jobs: readonly T[]) =>
      jobs.map((job) => protect(job)),
  } as unknown as ResultReadPolicyService;
};
