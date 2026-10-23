import { randomUUID } from 'node:crypto';
import {
  researchEvidenceAuditV2Schema,
  type Quote,
  type FundNav,
  type ResearchFrozenEvidenceV2,
  type ResearchScopeSnapshotV2,
} from '@thesis-ledger/schemas';
import type { MarketNewsResult } from '../market/market-news-contract.js';

type Instrument = Extract<ResearchScopeSnapshotV2, { scope: 'instrument' }>['instrument'];
const placeholder = '0'.repeat(64);
const audit = (kind: 'quote' | 'news'): ResearchFrozenEvidenceV2['audit'] => ({
  evidenceId: randomUUID(),
  fingerprint: placeholder,
  kind,
  providerId: null,
  upstreamSource: null,
  contractVersion: null,
  policyRevision: null,
  routeRevision: null,
  credentialRevision: null,
  sourceIds: [],
  sourceUrls: [],
  publishedAt: null,
  availableAt: null,
  fetchedAt: null,
});

export function missingResearchEvidence(
  kind: 'quote' | 'news',
  required: boolean,
  reason: string,
): ResearchFrozenEvidenceV2 {
  return {
    audit: audit(kind),
    required,
    usable: false,
    status: 'unavailable',
    data: null,
    numericFields: [],
    reasons: [reason],
  };
}

export function quoteResearchEvidence(
  quote: Quote,
  instrument: Instrument,
  cutoff: string,
): ResearchFrozenEvidenceV2 {
  const reasons = ['quote_route_revision_unrecorded'];
  const currency = quote.units?.priceCurrency ?? null;
  const clockKnown = [quote.fetchedAt, quote.marketTime].filter(
    (value): value is string => value !== null,
  );
  const usable =
    quote.symbol === instrument.symbol &&
    quote.price > 0 &&
    !quote.stale &&
    ['live', 'delayed'].includes(quote.freshness) &&
    currency === instrument.currency &&
    clockKnown.every((value) => Date.parse(value) <= Date.parse(cutoff));
  if (!usable) reasons.push('quote_material_unqualified');
  if (quote.marketTime === null) reasons.push('quote_market_time_unrecorded');
  const urls = quote.sourceUrl ? [quote.sourceUrl] : [];
  const safeUrls = researchEvidenceAuditV2Schema.shape.sourceUrls.safeParse(urls);
  if (!safeUrls.success) reasons.push('quote_source_url_unusable');
  return {
    audit: {
      ...audit('quote'),
      providerId: quote.provider,
      upstreamSource: quote.upstreamSource ?? null,
      contractVersion: 'market-quote-v3',
      sourceIds: [`${instrument.symbol}@${quote.marketTime ?? quote.fetchedAt}`],
      sourceUrls: safeUrls.success ? safeUrls.data : [],
      publishedAt: quote.marketTime,
      fetchedAt: quote.fetchedAt,
    },
    required: true,
    usable,
    status: 'partial',
    reasons,
    data: {
      instrumentId: instrument.instrumentId,
      symbol: quote.symbol,
      price: quote.price,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      previousClose: quote.previousClose,
      currency,
      marketTime: quote.marketTime,
      fetchedAt: quote.fetchedAt,
      freshness: quote.freshness,
    },
    numericFields: usable
      ? ['price', 'open', 'high', 'low', 'previousClose'].map((field) => ({
          fieldPath: `/${field}`,
          unit: 'price',
          currency,
        }))
      : [],
  };
}

export function newsResearchEvidence(
  news: MarketNewsResult,
  required: boolean,
  cutoff: string,
): ResearchFrozenEvidenceV2[] {
  if (!news.items.length || !news.source || news.status === 'unavailable') {
    const missing = missingResearchEvidence(
      'news',
      required,
      news.items.length ? 'news_route_unavailable' : 'news_empty_or_unavailable',
    );
    missing.reasons = [
      ...new Set([
        ...missing.reasons,
        ...news.errors.map((error) => `news_${error.code}`),
        ...news.coverage.missingReasons,
      ]),
    ].slice(0, 100);
    return [missing];
  }
  const route = news.source;
  const entries: ResearchFrozenEvidenceV2[] = news.items.map((item) => {
    const reasons = [...news.coverage.missingReasons];
    if (!news.coverage.complete) reasons.push('news_coverage_incomplete');
    if (news.coverage.truncated) reasons.push('news_coverage_truncated');
    if (item.publishedAt === null) reasons.push('news_published_time_unrecorded');
    if (item.sourceAvailableAt === null) reasons.push('news_available_time_unrecorded');
    const usable = [item.publishedAt, item.sourceAvailableAt, item.fetchedAt].every(
      (time) => time === null || Date.parse(time) <= Date.parse(cutoff),
    );
    if (!usable) reasons.push('news_time_after_cutoff');
    const status = reasons.length || news.status === 'partial' ? 'partial' : 'available';
    if (status === 'partial' && !reasons.length) reasons.push('news_source_partial');
    return {
      audit: {
        ...audit('news'),
        providerId: item.providerId,
        upstreamSource: route.upstreamSource,
        contractVersion: 'news-search-v1',
        policyRevision: route.policyRevision,
        routeRevision: route.routeRevision,
        credentialRevision: route.credentialRevision,
        sourceIds: [item.id, ...(item.sourceItemId ? [item.sourceItemId] : [])],
        sourceUrls: item.sourceUrls,
        publishedAt: item.publishedAt,
        availableAt: item.sourceAvailableAt,
        fetchedAt: item.fetchedAt,
      },
      required: false,
      usable,
      status,
      reasons: [...new Set(reasons)].slice(0, 100),
      numericFields: [],
      data: {
        items: [
          {
            title: item.title,
            excerpt: item.excerpt?.slice(0, 2_000) ?? null,
            excerptTruncated: (item.excerpt?.length ?? 0) > 2_000,
            publisher: item.publisher,
            evidenceGroupId: item.evidenceGroupId,
            contentFingerprint: item.contentFingerprint,
            relatedInstruments: item.relatedInstruments,
          },
        ],
        coverage: news.coverage,
      },
    };
  });
  const firstUsable = entries.find((entry) => entry.usable);
  if (required && firstUsable) firstUsable.required = true;
  else if (required)
    entries.push(missingResearchEvidence('news', true, 'news_required_material_unavailable'));
  return entries;
}

export function fundNavResearchEvidence(
  read: {
    nav: FundNav;
    currency: 'CNY';
    currencySource: 'confirmed-asset';
    currencyConfirmedAt: string;
  },
  instrument: Instrument,
  cutoff: string,
): ResearchFrozenEvidenceV2 {
  const nav = read.nav;
  const usable =
    nav.symbol === instrument.symbol &&
    nav.unitNav > 0 &&
    nav.freshness === 'delayed' &&
    [nav.navDate, nav.fetchedAt, read.currencyConfirmedAt].every(
      (time) => Date.parse(time) <= Date.parse(cutoff),
    );
  const reasons = ['fund_nav_publication_time_unrecorded', 'fund_nav_route_revision_unrecorded'];
  if (!usable) reasons.push('fund_nav_material_unqualified');
  return {
    audit: {
      ...audit('quote'),
      providerId: nav.provider,
      contractVersion: 'market-fund-nav-v3',
      sourceIds: [`${instrument.symbol}@${nav.navDate}`, `asset:${instrument.symbol}`],
      fetchedAt: nav.fetchedAt,
    },
    required: true,
    usable,
    status: 'partial',
    reasons,
    data: {
      instrumentId: instrument.instrumentId,
      symbol: nav.symbol,
      price: nav.unitNav,
      currency: read.currency,
      valuationDate: nav.navDate,
      fetchedAt: nav.fetchedAt,
      freshness: nav.freshness,
      currencySource: read.currencySource,
      currencyConfirmedAt: read.currencyConfirmedAt,
    },
    numericFields: usable
      ? [{ fieldPath: '/price', unit: 'unit-nav', currency: read.currency }]
      : [],
  };
}
