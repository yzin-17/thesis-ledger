import { createHash } from 'node:crypto';
import type { HistoricalDecisionWindowV3 } from '@thesis-ledger/schemas';

type Artifact = HistoricalDecisionWindowV3['calendarArtifacts'][number];
export type XshgPackageSourceV1 = { holidays: string[]; minutes: readonly number[] };

export const XSHG_PACKAGE_SOURCE_REGISTRATION_V1 = Object.freeze({
  version: '4.13.2',
  fileCount: 93,
  sourceBytes: 695_008,
  artifactSha256: 'fc5a2ad0d61b5c3a6539a3061cd4cbb55c59f4a903455cec7926e4b798919996',
  sourceTreeHash: '3dd6286cd2404bbe188e843a7ada5625164fff6059eb18c69d080213c3e29dea',
  xshgSha256: '0450145f89c503f7311ebdabfa75177b21cd01aa5ec2dcc54cfc5a23f118336a',
});

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

/** 规范编码及预算在解码前核对；Buffer 本身会宽松接受非规范输入。 */
export function decodeCalendarPackageBase64V1(text: string, maxBytes: number): Buffer {
  if (
    text.length > 4 * Math.ceil(maxBytes / 3) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)
  )
    throw new Error('source-base64');
  const bytes = Buffer.from(text, 'base64');
  if (bytes.length > maxBytes || bytes.toString('base64') !== text)
    throw new Error('source-base64');
  return bytes;
}

/** 专用文本提取接缝；生产调用前必须完成完整固定源码树认证。 */
export function extractXshgPackageSourceV1(source: string): XshgPackageSourceV1 {
  if (Buffer.byteLength(source) > 20_000) throw new Error('source-budget');
  const starts = [...source.matchAll(/^precomputed_shanghai_holidays = pd\.to_datetime\(\s*$/gm)];
  if (starts.length !== 1) throw new Error('source-holiday-syntax');
  const rest = source.slice(starts[0]!.index + starts[0]![0].length);
  const block = /^\s*\[\s*\n([\s\S]*?)^\s*\]\s*\n\)\s*$/m.exec(rest);
  if (!block) throw new Error('source-holiday-syntax');
  const holidays: string[] = [];
  for (const line of block[1]!.split('\n')) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    const item = /^\s*"(\d{4}-\d{2}-\d{2})",\s*(?:#.*)?$/.exec(line);
    if (
      !item ||
      !Number.isFinite(Date.parse(item[1]!)) ||
      new Date(item[1]!).toISOString().slice(0, 10) !== item[1] ||
      (holidays.length > 0 && item[1] <= holidays[holidays.length - 1]!)
    )
      throw new Error('source-holiday-syntax');
    holidays.push(item[1]);
  }
  if (holidays.length !== 605) throw new Error('source-holiday-count');
  for (const declaration of [
    /^class XSHGExchangeCalendar\(PrecomputedExchangeCalendar\):$/gm,
    /^ {4}name = "XSHG"$/gm,
    /^ {4}tz = ZoneInfo\("Asia\/Shanghai"\)$/gm,
  ])
    if ([...source.matchAll(declaration)].length !== 1) throw new Error('source-class');
  const minutes: number[] = [];
  for (const name of ['open_times', 'break_start_times', 'break_end_times', 'close_times']) {
    const pattern = new RegExp(`^    ${name} = \\(\\(None, time\\((\\d+), (\\d+)\\)\\),\\)$`, 'gm');
    const matches = [...source.matchAll(pattern)];
    if (matches.length !== 1) throw new Error('source-session');
    minutes.push(Number(matches[0]![1]) * 60 + Number(matches[0]![2]));
  }
  if (minutes.join(',') !== '570,690,780,900') throw new Error('source-session');
  return { holidays, minutes };
}

/** wheel 到源码树是审核登记的关系；此函数不重算 ZIP 摘要。 */
export function verifyXshgPackageSourceV1(artifact: Artifact): XshgPackageSourceV1 {
  const registration = XSHG_PACKAGE_SOURCE_REGISTRATION_V1;
  if (
    artifact.version !== registration.version ||
    artifact.artifactSha256 !== registration.artifactSha256 ||
    artifact.sourceTreeHash !== registration.sourceTreeHash ||
    artifact.files.length !== registration.fileCount
  )
    throw new Error('source-registration');
  const paths = new Set<string>();
  const records: string[] = [];
  let total = 0;
  let xshg: Buffer | undefined;
  for (const file of artifact.files) {
    if (
      file.relativePath.length > 1_024 ||
      !/^exchange_calendars\/(?:[A-Za-z0-9_]+\/)*[A-Za-z0-9_]+\.py$/.test(file.relativePath) ||
      paths.has(file.relativePath)
    )
      throw new Error('source-path');
    paths.add(file.relativePath);
    const bytes = decodeCalendarPackageBase64V1(file.rawBase64, registration.sourceBytes - total);
    total += bytes.length;
    const digest = sha256(bytes);
    if (digest !== file.sha256) throw new Error('source-file-hash');
    records.push(`${file.relativePath}:${digest}`);
    if (file.relativePath === 'exchange_calendars/exchange_calendar_xshg.py') {
      if (digest !== registration.xshgSha256) throw new Error('source-xshg-hash');
      xshg = bytes;
    }
  }
  if (
    total !== registration.sourceBytes ||
    sha256(records.sort().join('\n')) !== registration.sourceTreeHash ||
    !xshg
  )
    throw new Error('source-tree-hash');
  return extractXshgPackageSourceV1(new TextDecoder('utf-8', { fatal: true }).decode(xshg));
}
