import { Prisma, type FundValuationPoint } from '@prisma/client';
import { fundValuationSchema, type FundNav } from '@thesis-ledger/schemas';
import type { MarketSessionState } from '@thesis-ledger/domain';
import { z } from 'zod';
import { fundValuationDay } from './fund-valuation-point.repository.js';

const evidenceSchema = z.object({
  symbol: z.string(),
  estimatedNav: z.number().positive(),
  disclosureCoverage: z.number(),
  pricedCoverage: z.number(),
  disclosureAvailableAt: z.string(),
  holdingPrices: z.array(
    z.object({
      status: z.string(),
      quoteTradingDate: z.string().optional(),
      quoteMarketTime: z.string().optional().nullable(),
      inputFingerprint: z.string().optional(),
      anchorDate: z.string().optional(),
      anchorAdjustedClose: z.number().positive().optional(),
      currentAdjustedClose: z.number().positive().optional(),
      sourcePriceBasis: z.object({ adjustment: z.string() }).optional(),
    }),
  ),
});
export function closingEstimate(row: FundValuationPoint, now: Date, session: MarketSessionState) {
  const at = row.lastValidAt;
  if (!at || session.state !== 'open' || Date.parse(session.evaluatedAt) !== at.getTime()) return null;
  const day = fundValuationDay(at);
  const closingAt = session.sessions.filter((window) => window.tradingDate === day).at(-1)?.endAt;
  if (!closingAt || now.getTime() < Date.parse(closingAt)) return null;
  const snapshot = fundValuationSchema.safeParse(row.lastValidSnapshot);
  if (!snapshot.success) return null;
  const value = snapshot.data;
  const raw =
    row.lastValidEvidence ?? (row.observedAt.getTime() === at.getTime() ? row.evidence : null);
  const parsed = evidenceSchema.safeParse(raw);
  if (
    !parsed.success ||
    !raw ||
    !value.anchor ||
    !value.estimatedAt ||
    value.estimatedNav === null ||
    value.quality === 'unavailable' ||
    value.marketState !== 'open' ||
    value.symbol !== row.symbol ||
    value.method !== row.method ||
    Date.parse(value.estimatedAt) !== at.getTime() ||
    Math.floor(at.getTime() / 60000) * 60000 !== row.minute.getTime()
  )
    return null;
  const e = parsed.data,
    available = e.holdingPrices.filter((p) => p.status === 'available');
  if (
    e.symbol !== row.symbol ||
    e.estimatedNav !== value.estimatedNav ||
    e.pricedCoverage !== value.pricedCoverage ||
    e.disclosureCoverage !== value.disclosureCoverage ||
    !(Date.parse(e.disclosureAvailableAt) <= at.getTime()) ||
    !available.length ||
    available.some(
      (p) =>
        !p.inputFingerprint ||
        p.sourcePriceBasis?.adjustment !== 'qfq' ||
        !p.anchorAdjustedClose ||
        !p.currentAdjustedClose ||
        p.anchorDate !== value.anchor!.navDate.slice(0, 10) ||
        p.quoteTradingDate !== day ||
        !(
          Date.parse(p.quoteMarketTime ?? '') >= at.getTime() - 300000 &&
          Date.parse(p.quoteMarketTime ?? '') < row.minute.getTime() + 60000
        ),
    )
  )
    return null;
  return {
    symbol: row.symbol,
    method: row.method,
    day,
    minute: row.minute,
    estimate: value,
    evidence: raw as Prisma.InputJsonValue,
  };
}

export function fundErrorFor(
  day: string,
  symbol: string,
  estimate: number,
  nav: FundNav,
  now: Date,
  closingAt: string,
) {
  if (
    nav.symbol !== symbol ||
    fundValuationDay(new Date(nav.navDate)) !== day ||
    !Number.isFinite(nav.unitNav) ||
    nav.unitNav <= 0 ||
    nav.freshness !== 'delayed' ||
    nav.fallbackUsed ||
    nav.provider !== 'akshare' ||
    !(
      Date.parse(nav.fetchedAt) >= Date.parse(closingAt) &&
      Date.parse(nav.fetchedAt) <= now.getTime()
    )
  )
    return null;
  const signed = new Prisma.Decimal(estimate).minus(String(nav.unitNav));
  return {
    signed: signed.toFixed(),
    absolute: signed.abs().toFixed(),
    relativeAbsolute: signed.abs().div(String(nav.unitNav)).toFixed(),
  };
}
