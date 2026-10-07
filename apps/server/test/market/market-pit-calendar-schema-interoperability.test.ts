import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bindMarketPitReconstructionManifestV3,
  marketPitReconstructionManifestV3Schema,
  marketDataBarSeriesRequestV3Schema,
  marketDataBarSeriesResponseV3Schema,
  type HistoricalDecisionWindowV3,
} from '@thesis-ledger/schemas';
import {
  parseMarketPitCalendarPackageV1,
  XSHG_PACKAGE_PUBLICATION_REGISTRATION_V1,
  type CalendarPackageParseInputV1,
} from '../../src/market/market-pit-calendar-package-v1.js';
import {
  verifyXshgPackageSourceV1,
  XSHG_PACKAGE_SOURCE_REGISTRATION_V1,
} from '../../src/market/market-pit-calendar-package-source-v1.js';
import {
  recomputeXshgPackageProjectionV1,
  xshgPackageCalendarContentHashV1,
  xshgPackageProjectionHashV1,
  XSHG_PACKAGE_NORMALIZATION_V1,
  XSHG_PACKAGE_TIMEZONE_RULES_V1,
} from '../../src/market/market-pit-calendar-package-projection-v1.js';

const directory = process.env.S05_CALENDAR_PUBLIC_INPUT_DIRECTORY;
const registration = XSHG_PACKAGE_PUBLICATION_REGISTRATION_V1;
const rehash = (input: CalendarPackageParseInputV1) => {
  input.calendar.projectionHash = xshgPackageProjectionHashV1(input.calendar);
  input.calendar.calendarContentHash = xshgPackageCalendarContentHashV1({
    parserVersion: input.publication.parserVersion,
    rawSha256: input.publication.raw.sha256,
    artifactSha256: input.artifact.artifactSha256,
    sourceTreeHash: input.artifact.sourceTreeHash,
    calendar: input.calendar,
  });
};
const fixture = () => {
  const knownAvailableAt = registration.knownAvailableAt;
  const acquiredAt = '2026-04-08T00:00:00Z';
  const dataAsOf = '2026-05-21T08:00:00Z';
  const packageInput: CalendarPackageParseInputV1 = {
    publication: {
      id: 'publication',
      kind: 'calendar-package-release',
      publisher: registration.publisher,
      originUri: registration.originUri,
      revision: registration.revision,
      parserVersion: registration.parserVersion,
      raw: {
        encoding: 'utf8',
        bytes: readFileSync(`${directory}/metadata.json`, 'utf8'),
        sha256: registration.rawSha256,
      },
      publicationLocator: registration.publicationLocator,
      knownAvailableAt,
      acquiredAt,
    },
    artifact: {
      id: 'artifact',
      version: registration.revision,
      publicationId: 'publication',
      artifactSha256: XSHG_PACKAGE_SOURCE_REGISTRATION_V1.artifactSha256,
      sourceTreeHash: XSHG_PACKAGE_SOURCE_REGISTRATION_V1.sourceTreeHash,
      files: JSON.parse(
        readFileSync(`${directory}/sources.json`, 'utf8'),
      ) as HistoricalDecisionWindowV3['calendarArtifacts'][number]['files'],
    },
    calendar: {
      id: 'calendar',
      calendarContentHash: '0'.repeat(64),
      projectionHash: '0'.repeat(64),
      market: 'CN',
      exchange: 'XSHG',
      timezone: 'Asia/Shanghai',
      symbolScope: ['159516.SZ'],
      venueBindingEvidenceIds: ['publication'],
      historicalRange: { start: '2026-05-18', end: '2026-05-21' },
      knownAvailableAt,
      acquiredAt,
      normalizationVersion: XSHG_PACKAGE_NORMALIZATION_V1,
      timezoneRulesIdentity: XSHG_PACKAGE_TIMEZONE_RULES_V1,
      dateStates: [],
      publicationIds: ['publication'],
      calendarArtifactId: 'artifact',
    },
    dataAsOf,
    decisionAt: '2026-05-18T07:00:00Z',
  };
  packageInput.calendar = recomputeXshgPackageProjectionV1(
    packageInput.calendar,
    verifyXshgPackageSourceV1(packageInput.artifact),
    'publication',
  );
  rehash(packageInput);
  const parsed = parseMarketPitCalendarPackageV1(packageInput);
  expect(parsed.status).toBe('calendar-package-verified');
  if (parsed.status !== 'calendar-package-verified') throw new Error(parsed.reason);
  const response = marketDataBarSeriesResponseV3Schema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../packages/schemas/fixtures/market-data-v3.response.etf-qfq.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  response.sourcePriceBasis.anchor = '2026-05-18';
  const request = marketDataBarSeriesRequestV3Schema.parse({
    contractVersion: 3,
    requestId: response.requestId,
    symbol: response.symbol,
    routeKey: response.routeKey,
    routeTarget: {
      providerId: response.provenance.providerId,
      upstreamSource: response.provenance.upstreamSource,
      routeIndex: response.provenance.routeIndex,
    },
    start: response.coverage.requestedStart,
    end: response.coverage.requestedEnd,
  });
  const barArchives = response.bars.map((bar, index) => ({
    timestamp: bar.timestamp,
    windowIdentityFingerprint: `${'b'.repeat(63)}${index}`,
    completeResponseHash: `${'c'.repeat(63)}${index}`,
  }));
  // 只有日历是实际认证产物；来源见证和证券引用是必要结构向量，不授予历史真实性。
  const evidence: HistoricalDecisionWindowV3 = {
    contractVersion: 1,
    kind: 'market-pit-historical-decision-window',
    calendars: [parsed.calendar],
    calendarArtifacts: [packageInput.artifact],
    originalEvidence: [
      packageInput.publication,
      {
        ...packageInput.publication,
        id: 'capture',
        kind: 'server-archive-capture',
        parserVersion: 'structural-fixture',
      },
    ],
    sourceWitnesses: barArchives.map(
      ({ windowIdentityFingerprint, completeResponseHash }, index) => ({
        windowIdentityFingerprint,
        completeResponseHash,
        id: `witness-${index}`,
        captureEvidenceId: 'capture',
        revisionPublicationIds: ['publication'],
        revisionKnownAvailableAt: knownAvailableAt,
      }),
    ),
    barDecisionBindings: barArchives.map((archive, index) => ({
      ...archive,
      calendarEvidenceId: 'calendar',
      sourceWitnessId: `witness-${index}`,
      tradingDate: parsed.calendar.dateStates[index]!.date,
      decisionAt: response.bars[index]!.availableAt,
      closedAt: parsed.calendar.dateStates[index]!.sessions.at(-1)!.closedAt,
      nextTradingDate: parsed.calendar.dateStates[index + 1]!.date,
      nextOpenedAt: parsed.calendar.dateStates[index + 1]!.sessions[0]!.openedAt,
    })),
  };
  const seriesVersion = `market-series-v1:identified:${'a'.repeat(64)}`;
  const proof = {
    contractVersion: 2,
    kind: 'market-pit-reconstruction',
    symbol: request.symbol,
    routeKey: request.routeKey,
    target: request.routeTarget,
    window: { start: request.start, end: request.end },
    seriesVersion,
    inputFingerprint: response.inputFingerprint,
    sourcePriceBasis: response.sourcePriceBasis,
    dataAsOf,
    barArchives,
    historicalDecisionWindow: evidence,
  };
  return { packageInput, request, response, dataAsOf, seriesVersion, proof };
};

describe.skipIf(!directory)('真实固定 parser 与 v2 必要结构互操作', () => {
  it('真实复算 UTC 投影完整保留在 v2 中重新绑定，不改写输入或签发准入', () => {
    const input = fixture();
    const original = structuredClone(input);
    expect(input.proof.historicalDecisionWindow.calendars[0]!.dateStates[0]!.sessions[0]).toEqual({
      startMinute: 570,
      endMinute: 690,
      openedAt: '2026-05-18T01:30:00.000Z',
      closedAt: '2026-05-18T03:30:00.000Z',
    });
    expect(marketPitReconstructionManifestV3Schema.parse(input.proof)).toEqual(input.proof);
    expect(bindMarketPitReconstructionManifestV3(input)).toEqual({
      status: 'bound',
      proof: input.proof,
    });
    expect(input).toEqual(original);
    expect(bindMarketPitReconstructionManifestV3(input)).not.toHaveProperty('eligible');
  });
  it('同一 UTC 瞬时的 +08 表示可通过结构绑定，但不能伪称固定 parser 原投影摘要', () => {
    const input = fixture();
    for (const state of input.proof.historicalDecisionWindow.calendars[0]!.dateStates)
      for (const session of state.sessions) {
        session.openedAt = `${state.date}T${String(Math.floor(session.startMinute / 60)).padStart(2, '0')}:${String(session.startMinute % 60).padStart(2, '0')}:00+08:00`;
        session.closedAt = `${state.date}T${String(Math.floor(session.endMinute / 60)).padStart(2, '0')}:${String(session.endMinute % 60).padStart(2, '0')}:00+08:00`;
      }
    expect(bindMarketPitReconstructionManifestV3(input).status).toBe('bound');
    input.packageInput.calendar = input.proof.historicalDecisionWindow.calendars[0]!;
    rehash(input.packageInput);
    expect(parseMarketPitCalendarPackageV1(input.packageInput)).toEqual({
      status: 'unavailable',
      reason: 'calendar-projection',
    });
  });
  it.each(['raw-hour', 'utc-shift', 'local-date', 'offset'] as const)(
    '拒绝 %s 篡改；自报新摘要不绕过原包复算',
    (kind) => {
      const input = fixture();
      const calendar = input.proof.historicalDecisionWindow.calendars[0]!;
      const session = calendar.dateStates[0]!.sessions[0]!;
      if (kind === 'raw-hour') session.openedAt = '2026-05-18T09:30:00Z';
      else if (kind === 'utc-shift') session.openedAt = '2026-05-18T01:31:00Z';
      else if (kind === 'local-date') session.openedAt = '2026-05-17T01:30:00Z';
      else session.openedAt = '2026-05-18T09:30:00+07:00';
      expect(bindMarketPitReconstructionManifestV3(input)).toEqual({
        status: 'unavailable',
        reason: 'invalid-proof',
      });
      input.packageInput.calendar = calendar;
      rehash(input.packageInput);
      expect(parseMarketPitCalendarPackageV1(input.packageInput)).toEqual({
        status: 'unavailable',
        reason: 'calendar-projection',
      });
    },
  );
});
