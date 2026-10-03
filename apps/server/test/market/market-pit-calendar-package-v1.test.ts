import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  marketPitHistoricalDecisionWindowV3Schema,
  type HistoricalDecisionWindowV3,
} from '@thesis-ledger/schemas';
import { describe, expect, it } from 'vitest';
import {
  parseCalendarPackageJsonV1,
  parseMarketPitCalendarPackageV1,
  verifyCalendarPackageMetadataV1,
  XSHG_PACKAGE_PUBLICATION_REGISTRATION_V1,
  type CalendarPackageParseInputV1,
} from '../../src/market/market-pit-calendar-package-v1.js';
import {
  XSHG_PACKAGE_SOURCE_REGISTRATION_V1,
  verifyXshgPackageSourceV1,
} from '../../src/market/market-pit-calendar-package-source-v1.js';
import {
  recomputeXshgPackageProjectionV1,
  xshgPackageCalendarContentHashV1,
  xshgPackageProjectionHashV1,
  XSHG_PACKAGE_NORMALIZATION_V1,
  XSHG_PACKAGE_TIMEZONE_RULES_V1,
} from '../../src/market/market-pit-calendar-package-projection-v1.js';

const registration = XSHG_PACKAGE_PUBLICATION_REGISTRATION_V1;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const metadata = (): {
  info: { name: string; version: string };
  urls: {
    filename: string;
    packagetype: string;
    python_version: string;
    digests: { sha256: string };
    url: string;
    size: number;
    yanked: boolean;
    upload_time_iso_8601: string;
  }[];
} => ({
  info: { name: 'exchange_calendars', version: '4.13.2' },
  urls: [
    {
      filename: registration.wheelFilename,
      packagetype: 'bdist_wheel',
      python_version: 'py3',
      digests: { sha256: XSHG_PACKAGE_SOURCE_REGISTRATION_V1.artifactSha256 },
      url: registration.wheelUrl,
      size: registration.wheelBytes,
      yanked: false,
      upload_time_iso_8601: registration.knownAvailableAt,
    },
  ],
});
const seed = (): CalendarPackageParseInputV1 => ({
  publication: {
    id: 'publication',
    kind: 'calendar-package-release',
    publisher: registration.publisher,
    originUri: registration.originUri,
    revision: registration.revision,
    parserVersion: registration.parserVersion,
    raw: { encoding: 'utf8', bytes: '{}', sha256: registration.rawSha256 },
    publicationLocator: registration.publicationLocator,
    knownAvailableAt: registration.knownAvailableAt,
    acquiredAt: '2026-04-08T00:00:00Z',
  },
  artifact: {
    id: 'artifact',
    version: '4.13.2',
    publicationId: 'publication',
    artifactSha256: XSHG_PACKAGE_SOURCE_REGISTRATION_V1.artifactSha256,
    sourceTreeHash: XSHG_PACKAGE_SOURCE_REGISTRATION_V1.sourceTreeHash,
    files: [],
  },
  calendar: {
    id: 'calendar',
    calendarContentHash: '0'.repeat(64),
    projectionHash: '0'.repeat(64),
    market: 'CN',
    exchange: 'XSHG',
    timezone: 'Asia/Shanghai',
    symbolScope: ['600000.SH'],
    venueBindingEvidenceIds: ['unverified-venue'],
    historicalRange: { start: '2026-04-03', end: '2026-04-07' },
    knownAvailableAt: registration.knownAvailableAt,
    acquiredAt: '2026-04-08T00:00:00Z',
    normalizationVersion: XSHG_PACKAGE_NORMALIZATION_V1,
    timezoneRulesIdentity: XSHG_PACKAGE_TIMEZONE_RULES_V1,
    dateStates: [],
    publicationIds: ['publication'],
    calendarArtifactId: 'artifact',
  },
  dataAsOf: '2026-04-09T00:00:00Z',
  decisionAt: '2026-04-03T07:00:02Z',
});
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

describe('固定原发布入口', () => {
  it('合法受控核心metadata，仅说明核心字段检查', () => {
    expect(() => verifyCalendarPackageMetadataV1(metadata())).not.toThrow();
    expect(parseMarketPitCalendarPackageV1(seed())).toEqual({
      status: 'unavailable',
      reason: 'publication-raw-hash',
    });
  });
  it.each(['version', 'origin', 'publisher', 'parser', 'locator', 'kind', 'availableAt'])(
    '登记拒绝任意替换 %s',
    (field) => {
      const input = seed();
      if (field === 'version') input.publication.revision = '4.13.3';
      else if (field === 'origin') input.publication.originUri = 'https://attacker.invalid/';
      else if (field === 'publisher') input.publication.publisher = 'Shanghai Stock Exchange';
      else if (field === 'parser') input.publication.parserVersion = 'unknown';
      else if (field === 'locator') input.publication.publicationLocator = '/info/time';
      else if (field === 'kind') input.publication.kind = 'exchange-publication';
      else input.publication.knownAvailableAt = '2026-03-10T03:24:37.055Z';
      expect(parseMarketPitCalendarPackageV1(input)).toEqual({
        status: 'unavailable',
        reason: 'publication-registration',
      });
    },
  );
  it('篡改原文字节再自报摘要仍不被信任', () => {
    const input = seed();
    input.publication.raw.bytes = JSON.stringify(metadata());
    input.publication.raw.sha256 = sha256(input.publication.raw.bytes);
    expect(parseMarketPitCalendarPackageV1(input)).toEqual({
      status: 'unavailable',
      reason: 'publication-registration',
    });
  });
  it.each(['duplicate', 'sdist', 'url', 'digest', 'size', 'yanked', 'time'])(
    '核对唯一固定wheel %s',
    (field) => {
      const value = metadata();
      const wheel = value.urls[0]!;
      if (field === 'duplicate') value.urls.push({ ...wheel });
      else if (field === 'sdist') wheel.packagetype = 'sdist';
      else if (field === 'url') wheel.url += '?forged';
      else if (field === 'digest') wheel.digests.sha256 = '0'.repeat(64);
      else if (field === 'size') wheel.size += 1;
      else if (field === 'yanked') wheel.yanked = true;
      else wheel.upload_time_iso_8601 = '2026-03-10T03:24:37.055Z';
      expect(() => verifyCalendarPackageMetadataV1(value)).toThrow();
    },
  );
  it.each([
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"nested":{"x":1,"x":2}}',
    '{} trailing',
    '\ufeff{}',
    '{"x":',
  ])('拒绝重复键或无效JSON %s', (raw) => {
    expect(() => parseCalendarPackageJsonV1(Buffer.from(raw))).toThrow();
  });
  it('不同对象可含同名键、字符串逗号及escaped quote不成为伪键', () => {
    const text = JSON.stringify({ a: { x: 'comma, quote"' }, b: { x: 2 } });
    expect(parseCalendarPackageJsonV1(Buffer.from(text))).toEqual(JSON.parse(text));
  });
  it('损坏UTF8和原文预算拒绝', () => {
    expect(() => parseCalendarPackageJsonV1(Uint8Array.from([0xff]))).toThrow();
    expect(() => parseCalendarPackageJsonV1(Buffer.alloc(28_846, 32))).toThrow();
  });
});

// 官方公开输入独立探针：不安装依赖，外部准备原字节，不将整包写入仓库。
const publicInputDirectory = process.env.S05_CALENDAR_PUBLIC_INPUT_DIRECTORY;
it.skipIf(!publicInputDirectory)('实际原JSON与93份wheel源码：正向认证及自重哈希攻击拒绝', () => {
  const input = seed();
  input.publication.raw.bytes = readFileSync(`${publicInputDirectory}/metadata.json`, 'utf8');
  input.artifact.files = JSON.parse(
    readFileSync(`${publicInputDirectory}/sources.json`, 'utf8'),
  ) as HistoricalDecisionWindowV3['calendarArtifacts'][number]['files'];
  // 只验证真实原包记录的结构接缝，不构造证券场所或来源见证。
  expect(
    marketPitHistoricalDecisionWindowV3Schema.out.shape.calendarArtifacts.safeParse([
      input.artifact,
    ]).success,
  ).toBe(true);
  expect(
    marketPitHistoricalDecisionWindowV3Schema.out.shape.originalEvidence.safeParse([
      input.publication,
    ]).success,
  ).toBe(true);
  input.calendar = recomputeXshgPackageProjectionV1(
    input.calendar,
    verifyXshgPackageSourceV1(input.artifact),
    'publication',
  );
  rehash(input);
  expect(input.calendar.calendarContentHash).toBe(
    'a6200b338b1e6e7edd19800d32b30ed89c97621f04de589ba90af7148251f025',
  );
  const result = parseMarketPitCalendarPackageV1(input);
  expect(result.status).toBe('calendar-package-verified');
  if (result.status === 'calendar-package-verified') {
    expect(result.calendar).toEqual(input.calendar);
    expect(result.calendar).not.toBe(input.calendar);
  }
  const encoded = structuredClone(input);
  encoded.publication.raw.encoding = 'base64';
  encoded.publication.raw.bytes = Buffer.from(input.publication.raw.bytes).toString('base64');
  expect(parseMarketPitCalendarPackageV1(encoded).status).toBe('calendar-package-verified');
  for (const mutate of [
    (item: CalendarPackageParseInputV1) => {
      item.calendar.dateStates[3]!.reason = 'regular';
    },
    (item: CalendarPackageParseInputV1) => {
      item.calendar.dateStates[0]!.sessions[0]!.openedAt = '2026-04-03T02:30:00.000Z';
    },
    (item: CalendarPackageParseInputV1) => {
      item.calendar.dateStates[0]!.sessions[0]!.startMinute = 571;
    },
    (item: CalendarPackageParseInputV1) => {
      item.calendar.dateStates.splice(3, 1);
    },
    (item: CalendarPackageParseInputV1) => {
      item.calendar.dateStates[0]!.publicationIds = ['forged'];
    },
    (item: CalendarPackageParseInputV1) => {
      item.calendar.dateStates[0]!.reason = 'special-session';
    },
    (item: CalendarPackageParseInputV1) => {
      item.calendar.market = 'US';
    },
    (item: CalendarPackageParseInputV1) => {
      item.calendar.calendarArtifactId = 'forged';
    },
    (item: CalendarPackageParseInputV1) => {
      item.calendar.knownAvailableAt = '2026-03-10T03:24:37.055Z';
    },
    (item: CalendarPackageParseInputV1) => {
      item.publication.raw.bytes += '\n';
      item.publication.raw.sha256 = sha256(item.publication.raw.bytes);
    },
    (item: CalendarPackageParseInputV1) => {
      item.artifact.files[0]!.rawBase64 = Buffer.from('tampered').toString('base64');
      item.artifact.files[0]!.sha256 = sha256('tampered');
    },
    (item: CalendarPackageParseInputV1) => {
      item.artifact.files.pop();
    },
    (item: CalendarPackageParseInputV1) => {
      item.artifact.files[1]!.relativePath = item.artifact.files[0]!.relativePath;
    },
  ]) {
    const changed = structuredClone(input);
    mutate(changed);
    rehash(changed);
    expect(parseMarketPitCalendarPackageV1(changed).status).toBe('unavailable');
  }
  for (const field of ['decisionAt', 'publicationAcquired', 'calendarAcquired', 'dataAsOf']) {
    const changed = structuredClone(input);
    const before = '2026-03-10T03:24:37.055241Z';
    if (field === 'decisionAt') changed.decisionAt = before;
    else if (field === 'publicationAcquired') changed.publication.acquiredAt = before;
    else if (field === 'calendarAcquired') changed.calendar.acquiredAt = before;
    else changed.dataAsOf = '2026-04-07T23:59:59.999999Z';
    expect(parseMarketPitCalendarPackageV1(changed)).toEqual({
      status: 'unavailable',
      reason: 'publication-time',
    });
  }
  const boundary = structuredClone(input);
  boundary.decisionAt = registration.knownAvailableAt;
  boundary.publication.acquiredAt = registration.knownAvailableAt;
  boundary.calendar.acquiredAt = registration.knownAvailableAt;
  boundary.dataAsOf = registration.knownAvailableAt;
  expect(parseMarketPitCalendarPackageV1(boundary).status).toBe('calendar-package-verified');
  boundary.publication.acquiredAt = '2026-03-10T03:24:37.055243Z';
  expect(parseMarketPitCalendarPackageV1(boundary)).toEqual({
    status: 'unavailable',
    reason: 'publication-time',
  });
  const full = structuredClone(input);
  full.calendar.historicalRange = { start: '2026-03-10', end: '2026-12-31' };
  full.calendar = recomputeXshgPackageProjectionV1(
    full.calendar,
    verifyXshgPackageSourceV1(full.artifact),
    'publication',
  );
  rehash(full);
  expect(full.calendar.dateStates.length).toBe(297);
  expect(parseMarketPitCalendarPackageV1(full).status).toBe('calendar-package-verified');
});
