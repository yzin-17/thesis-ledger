import { randomUUID } from 'node:crypto';
import {
  RESEARCH_OBSERVATION_METHOD,
  type ResearchObservationEvaluation,
} from '@thesis-ledger/schemas';
import { comparisonOwner, comparisonReport } from './research-comparison.fixture.js';
import { researchObservationDigest } from '../../src/research/research-observation-identity.js';

export function observationFixture() {
  const report = comparisonReport();
  const start = {
    ownerId: comparisonOwner,
    submissionId: randomUUID(),
    runId: report.row.id,
    lineageId: report.row.id,
    artifactFingerprint: researchObservationDigest(report.source.detail.result),
    claimId: 'controlled-direction',
    windowTradingDays: 5 as const,
    methodVersion: RESEARCH_OBSERVATION_METHOD,
    visibleAt: '2026-10-19T08:00:00.000Z',
  };
  const inputs = {
    visibleAt: start.visibleAt,
    calendar: { status: 'unavailable', revision: 'controlled-calendar-1' },
    prices: { status: 'unavailable' },
  };
  const evaluation: ResearchObservationEvaluation = {
    status: 'insufficient_data',
    reasons: ['calendar_unqualified'],
    window: {
      tradingDays: 5,
      startSession: null,
      endSession: null,
      startCloseAt: null,
      endCloseAt: null,
    },
    economic: {
      basis: 'economic-close',
      currency: null,
      startPrice: null,
      endPrice: null,
      returnRate: null,
      directionMatched: null,
    },
  };
  const completed: ResearchObservationEvaluation = {
    status: 'completed',
    reasons: [],
    window: {
      tradingDays: 5,
      startSession: '2026-10-19',
      endSession: '2026-10-26',
      startCloseAt: '2026-10-19T07:00:00Z',
      endCloseAt: '2026-10-26T07:00:00Z',
    },
    economic: {
      basis: 'economic-close',
      currency: 'CNY',
      startPrice: '100',
      endPrice: '110',
      returnRate: '0.1',
      directionMatched: true,
    },
  };
  return { report, start, inputs, evaluation, completed };
}
