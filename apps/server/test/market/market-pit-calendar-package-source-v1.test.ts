import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decodeCalendarPackageBase64V1,
  extractXshgPackageSourceV1,
  verifyXshgPackageSourceV1,
  XSHG_PACKAGE_SOURCE_REGISTRATION_V1,
} from '../../src/market/market-pit-calendar-package-source-v1.js';

const digest = (text: string) => createHash('sha256').update(text).digest('hex');
// 受控语法向量，不冒充登记发行源码。
const holidays = Array.from({ length: 605 }, (_, index) =>
  new Date(Date.UTC(1991, 0, 1) + index * 86_400_000).toISOString().slice(0, 10),
);
const source = `precomputed_shanghai_holidays = pd.to_datetime(
    [
${holidays.map((date) => `        "${date}",`).join('\n')}
    ]
)
class XSHGExchangeCalendar(PrecomputedExchangeCalendar):
    name = "XSHG"
    tz = ZoneInfo("Asia/Shanghai")
    open_times = ((None, time(9, 30)),)
    break_start_times = ((None, time(11, 30)),)
    break_end_times = ((None, time(13, 0)),)
    close_times = ((None, time(15, 0)),)
`;
const artifact = () => ({
  id: 'artifact',
  publicationId: 'publication',
  ...XSHG_PACKAGE_SOURCE_REGISTRATION_V1,
  files: Array.from({ length: 93 }, (_, index) => ({
    relativePath: `exchange_calendars/file_${index}.py`,
    rawBase64: Buffer.from('x').toString('base64'),
    sha256: digest('x'),
  })),
});

describe('固定源码认证与专用提取', () => {
  it('受控语法向量提取605日期和四个分钟常量', () => {
    expect(extractXshgPackageSourceV1(source)).toEqual({ holidays, minutes: [570, 690, 780, 900] });
  });
  it.each(['eA=', 'eA==\n', 'eB==', 'eA', '!!!!'])('拒绝非规范base64 %s', (value) => {
    expect(() => decodeCalendarPackageBase64V1(value, 10)).toThrow('source-base64');
  });
  it('解码前后限制字节预算', () => {
    expect(decodeCalendarPackageBase64V1('', 0).length).toBe(0);
    expect(decodeCalendarPackageBase64V1('eA==', 1).toString()).toBe('x');
    expect(() => decodeCalendarPackageBase64V1('eHg=', 1)).toThrow();
  });
  it.each([
    ['expression', source.replace('"1991-01-01",', 'str("1991-01-01"),')],
    ['invalid-date', source.replace('"1991-01-01",', '"1991-02-30",')],
    ['duplicate-date', source.replace('"1991-01-02",', '"1991-01-01",')],
    ['holiday-deletion', source.replace('        "1991-01-01",\n', '')],
    ['duplicate-array', source + source],
    ['timezone', source.replace('Asia/Shanghai', 'America/New_York')],
    ['session', source.replace('time(15, 0)', 'time(15, 1)')],
    ['source-budget', source + ' '.repeat(20_001)],
  ])('拒绝受控源码错误 %s', (_, altered) => {
    expect(() => extractXshgPackageSourceV1(altered)).toThrow();
  });
  it.each([
    '/exchange_calendars/a.py',
    'exchange_calendars/../a.py',
    'exchange_calendars/a\\b.py',
    'exchange_calendars/a.txt',
    'other/a.py',
  ])('拒绝路径 %s', (path) => {
    const item = artifact();
    item.files[0]!.relativePath = path;
    expect(() => verifyXshgPackageSourceV1(item)).toThrow('source-path');
  });
  it('重复路径拒绝', () => {
    const item = artifact();
    item.files[1]!.relativePath = item.files[0]!.relativePath;
    expect(() => verifyXshgPackageSourceV1(item)).toThrow('source-path');
  });
  it.each([92, 94])('实际文件数不等于93拒绝 %s', (count) => {
    const item = artifact();
    item.files = Array.from({ length: count }, () => item.files[0]!);
    expect(() => verifyXshgPackageSourceV1(item)).toThrow('source-registration');
  });
  it('逐文件摘要与原文必须相符', () => {
    const item = artifact();
    item.files[0]!.rawBase64 = Buffer.from('tampered').toString('base64');
    expect(() => verifyXshgPackageSourceV1(item)).toThrow('source-file-hash');
  });
  it('攻击者更新文件摘要仍无法更新登记树', () => {
    const item = artifact();
    item.files[0]!.sha256 = digest('tampered');
    item.files[0]!.rawBase64 = Buffer.from('tampered').toString('base64');
    expect(() => verifyXshgPackageSourceV1(item)).toThrow('source-tree-hash');
  });
  it('仅填写登记树摘要不能替代93份真实字节', () => {
    expect(() => verifyXshgPackageSourceV1(artifact())).toThrow('source-tree-hash');
  });
  it('原文超出固定解码预算，在分配前拒绝', () => {
    const item = artifact();
    item.files[0]!.rawBase64 = 'eHh4'.repeat(240_000);
    expect(() => verifyXshgPackageSourceV1(item)).toThrow('source-base64');
  });
});
