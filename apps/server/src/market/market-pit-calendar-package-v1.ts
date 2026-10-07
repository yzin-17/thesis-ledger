import { createHash } from 'node:crypto';
import type { HistoricalDecisionWindowV3 } from '@thesis-ledger/schemas';
import {
  decodeCalendarPackageBase64V1,
  verifyXshgPackageSourceV1,
  XSHG_PACKAGE_SOURCE_REGISTRATION_V1,
} from './market-pit-calendar-package-source-v1.js';
import {
  calendarPackageInstantMicrosV1,
  recomputeXshgPackageProjectionV1,
  xshgPackageCalendarContentHashV1,
  xshgPackageProjectionHashV1,
} from './market-pit-calendar-package-projection-v1.js';

type Publication = HistoricalDecisionWindowV3['originalEvidence'][number];
type Artifact = HistoricalDecisionWindowV3['calendarArtifacts'][number];
type Calendar = HistoricalDecisionWindowV3['calendars'][number];

export const XSHG_PACKAGE_PUBLICATION_REGISTRATION_V1 = Object.freeze({
  parserVersion: 'pypi-exchange-calendars-4.13.2-xshg-v1',
  publisher: 'PyPI / exchange_calendars',
  originUri: 'https://pypi.org/pypi/exchange-calendars/4.13.2/json',
  revision: '4.13.2',
  rawBytes: 28_845,
  rawSha256: '38a86c1c1058cbaa84cb85ecafea74f9b19a7b87c10998a82f9df230bb52a87a',
  wheelFilename: 'exchange_calendars-4.13.2-py3-none-any.whl',
  wheelUrl:
    'https://files.pythonhosted.org/packages/c8/4c/0469b40057bc9f8d9594dcc6024202626b981ae4b52dfcd304552e8e1c3a/exchange_calendars-4.13.2-py3-none-any.whl',
  wheelBytes: 213_306,
  knownAvailableAt: '2026-03-10T03:24:37.055242Z',
  publicationLocator:
    'urls[filename=exchange_calendars-4.13.2-py3-none-any.whl].upload_time_iso_8601',
});

export type CalendarPackageParseInputV1 = {
  publication: Publication;
  artifact: Artifact;
  calendar: Calendar;
  dataAsOf: string;
  decisionAt?: string;
};
export type CalendarPackageParseResultV1 =
  | { status: 'calendar-package-verified'; calendar: Calendar; knownAvailableAt: string }
  | { status: 'unavailable'; reason: string };

/** JSON.parse 负责语法；词法遍历仅拒绝同一对象内重复（含转义后的）键。 */
export function parseCalendarPackageJsonV1(bytes: Uint8Array): unknown {
  if (
    bytes.length > XSHG_PACKAGE_PUBLICATION_REGISTRATION_V1.rawBytes ||
    (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
  )
    throw new Error('publication-json');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const parsed: unknown = JSON.parse(text);
  const frames: { object: boolean; keys: Set<string>; keyExpected: boolean }[] = [];
  const tokens = text.match(/"(?:[^"\\]|\\.)*"|[{}[\],:]|[^\s{}[\],:]+/g) ?? [];
  for (const token of tokens) {
    const frame = frames[frames.length - 1];
    if (token === '{' || token === '[') {
      frames.push({ object: token === '{', keys: new Set(), keyExpected: token === '{' });
    } else if (token === '}' || token === ']') {
      frames.pop();
    } else if (token === ',') {
      if (frame?.object) frame.keyExpected = true;
    } else if (frame?.object && frame.keyExpected && token.startsWith('"')) {
      const key = JSON.parse(token) as string;
      if (frame.keys.has(key)) throw new Error('publication-duplicate-key');
      frame.keys.add(key);
      frame.keyExpected = false;
    }
  }
  return parsed;
}

/** 固定核心字段专用核对；注册信任仅由生产入口的原文摘要建立。 */
export function verifyCalendarPackageMetadataV1(value: unknown): void {
  const registration = XSHG_PACKAGE_PUBLICATION_REGISTRATION_V1;
  const metadata = value as {
    info?: { name?: string; version?: string };
    urls?: {
      filename?: string;
      packagetype?: string;
      python_version?: string;
      digests?: { sha256?: string };
      url?: string;
      size?: number;
      yanked?: boolean;
      upload_time_iso_8601?: string;
    }[];
  };
  if (
    metadata?.info?.name !== 'exchange_calendars' ||
    metadata.info.version !== registration.revision ||
    !Array.isArray(metadata.urls)
  )
    throw new Error('publication-metadata');
  const wheels = metadata.urls.filter(
    (item) =>
      item?.filename === registration.wheelFilename &&
      item.packagetype === 'bdist_wheel' &&
      item.python_version === 'py3',
  );
  if (wheels.length !== 1) throw new Error('publication-wheel');
  const wheel = wheels[0]!;
  if (
    wheel.digests?.sha256 !== XSHG_PACKAGE_SOURCE_REGISTRATION_V1.artifactSha256 ||
    wheel.url !== registration.wheelUrl ||
    wheel.size !== registration.wheelBytes ||
    wheel.yanked !== false ||
    wheel.upload_time_iso_8601 !== registration.knownAvailableAt ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(wheel.upload_time_iso_8601)
  )
    throw new Error('publication-wheel');
}

function verifyPublicationRegistration(publication: Publication): void {
  const registration = XSHG_PACKAGE_PUBLICATION_REGISTRATION_V1;
  if (
    publication.kind !== 'calendar-package-release' ||
    publication.parserVersion !== registration.parserVersion ||
    publication.publisher !== registration.publisher ||
    publication.originUri !== registration.originUri ||
    publication.revision !== registration.revision ||
    publication.publicationLocator !== registration.publicationLocator ||
    publication.knownAvailableAt !== registration.knownAvailableAt ||
    publication.raw.sha256 !== registration.rawSha256
  )
    throw new Error('publication-registration');
}

function verifyPublication(publication: Publication, dataAsOf: string, decisionAt?: string): void {
  const registration = XSHG_PACKAGE_PUBLICATION_REGISTRATION_V1;
  verifyPublicationRegistration(publication);
  let bytes: Uint8Array;
  if (publication.raw.encoding === 'utf8') {
    if (publication.raw.bytes.length > registration.rawBytes) throw new Error('publication-budget');
    bytes = new TextEncoder().encode(publication.raw.bytes);
  } else if (publication.raw.encoding === 'base64') {
    bytes = decodeCalendarPackageBase64V1(publication.raw.bytes, registration.rawBytes);
  } else throw new Error('publication-encoding');
  if (
    bytes.length !== registration.rawBytes ||
    createHash('sha256').update(bytes).digest('hex') !== registration.rawSha256
  )
    throw new Error('publication-raw-hash');
  verifyCalendarPackageMetadataV1(parseCalendarPackageJsonV1(bytes));
  const published = calendarPackageInstantMicrosV1(registration.knownAvailableAt);
  const acquired = calendarPackageInstantMicrosV1(publication.acquiredAt);
  const cutoff = calendarPackageInstantMicrosV1(dataAsOf);
  if (
    acquired < published ||
    acquired > cutoff ||
    (decisionAt !== undefined &&
      (calendarPackageInstantMicrosV1(decisionAt) < published ||
        calendarPackageInstantMicrosV1(decisionAt) > cutoff))
  )
    throw new Error('publication-time');
}

/** 只证明固定原发布与 XSHG 投影；不签发证券场所或严格 PIT 资格。 */
export function parseMarketPitCalendarPackageV1(
  input: CalendarPackageParseInputV1,
): CalendarPackageParseResultV1 {
  try {
    const { publication, artifact, calendar, dataAsOf, decisionAt } = input;
    verifyPublication(publication, dataAsOf, decisionAt);
    if (
      artifact.publicationId !== publication.id ||
      calendar.calendarArtifactId !== artifact.id ||
      calendar.publicationIds.length !== 1 ||
      calendar.publicationIds[0] !== publication.id ||
      calendar.knownAvailableAt !== XSHG_PACKAGE_PUBLICATION_REGISTRATION_V1.knownAvailableAt ||
      calendar.dateStates.length > 297
    )
      throw new Error('calendar-publication-link');
    if (
      calendar.dateStates.some(
        (state) => state.sessions.length > 2 || state.publicationIds.length !== 1,
      )
    )
      throw new Error('calendar-projection');
    const acquired = calendarPackageInstantMicrosV1(calendar.acquiredAt);
    if (
      acquired < calendarPackageInstantMicrosV1(calendar.knownAvailableAt) ||
      acquired > calendarPackageInstantMicrosV1(dataAsOf)
    )
      throw new Error('publication-time');
    const source = verifyXshgPackageSourceV1(artifact);
    const recomputed = recomputeXshgPackageProjectionV1(calendar, source, publication.id);
    recomputed.calendarContentHash = xshgPackageCalendarContentHashV1({
      parserVersion: publication.parserVersion,
      rawSha256: publication.raw.sha256,
      artifactSha256: artifact.artifactSha256,
      sourceTreeHash: artifact.sourceTreeHash,
      calendar: recomputed,
    });
    if (
      calendar.projectionHash !== recomputed.projectionHash ||
      xshgPackageProjectionHashV1(calendar) !== recomputed.projectionHash ||
      calendar.calendarContentHash !== recomputed.calendarContentHash
    )
      throw new Error('calendar-projection');
    return {
      status: 'calendar-package-verified',
      calendar: recomputed,
      knownAvailableAt: XSHG_PACKAGE_PUBLICATION_REGISTRATION_V1.knownAvailableAt,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'calendar-package-invalid',
    };
  }
}
