import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  extractSzse2026HolidayNoticeFactsV1,
  parseSzse2026HolidayNoticeV1,
  SZSE_2026_HOLIDAY_NOTICE_V1,
} from '../../src/market/market-pit-szse-holiday-notice-v1.js';

const rawBase64 = readFileSync(
  new URL('./fixtures/szse-2026-holiday-notice.raw.base64', import.meta.url),
  'utf8',
).replace(/\s/g, '');
const raw = Buffer.from(rawBase64, 'base64');
const input = () => ({
  originUri: SZSE_2026_HOLIDAY_NOTICE_V1.originUri,
  publisher: SZSE_2026_HOLIDAY_NOTICE_V1.publisher,
  declaredSha256: SZSE_2026_HOLIDAY_NOTICE_V1.rawSha256,
  rawBase64,
});

describe('深交所 2026 固定休市通知', () => {
  it('由原字节复算七项休市区间及工作日，且不输出 PIT 资格', () => {
    expect(raw.length).toBe(SZSE_2026_HOLIDAY_NOTICE_V1.rawBytes);
    expect(createHash('sha256').update(raw).digest('hex')).toBe(
      SZSE_2026_HOLIDAY_NOTICE_V1.rawSha256,
    );
    const result = parseSzse2026HolidayNoticeV1(input());
    expect(result).toMatchObject({ status: 'holiday-notice-verified', noticeDate: '2025-12-22' });
    if (result.status !== 'holiday-notice-verified') return;
    expect(
      result.ranges.map(({ name, start, end, reopens }) => [name, start, end, reopens]),
    ).toEqual([
      ['元旦', '2026-01-01', '2026-01-03', '2026-01-05'],
      ['春节', '2026-02-15', '2026-02-23', '2026-02-24'],
      ['清明节', '2026-04-04', '2026-04-06', '2026-04-07'],
      ['劳动节', '2026-05-01', '2026-05-05', '2026-05-06'],
      ['端午节', '2026-06-19', '2026-06-21', '2026-06-22'],
      ['中秋节', '2026-09-25', '2026-09-27', '2026-09-28'],
      ['国庆节', '2026-10-01', '2026-10-07', '2026-10-08'],
    ]);
    expect(result.closedWeekdays).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-02-16',
      '2026-02-17',
      '2026-02-18',
      '2026-02-19',
      '2026-02-20',
      '2026-02-23',
      '2026-04-06',
      '2026-05-01',
      '2026-05-04',
      '2026-05-05',
      '2026-06-19',
      '2026-09-25',
      '2026-10-01',
      '2026-10-02',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ]);
    expect('knownAvailableAt' in result).toBe(false);
    expect('calendar' in result).toBe(false);
  });

  it.each(['originUri', 'publisher', 'declaredSha256'] as const)(
    '拒绝错源或自报身份 %s',
    (field) => {
      expect(parseSzse2026HolidayNoticeV1({ ...input(), [field]: 'forged' }).status).toBe(
        'unavailable',
      );
    },
  );

  it('篡改后即使自报新摘要也不能取代固定登记', () => {
    const mutated = Buffer.from(raw);
    mutated[mutated.indexOf(Buffer.from('2026'))] = '3'.charCodeAt(0);
    expect(
      parseSzse2026HolidayNoticeV1({ ...input(), rawBase64: mutated.toString('base64') }),
    ).toEqual({ status: 'unavailable', reason: 'source-raw-hash' });
    const result = parseSzse2026HolidayNoticeV1({
      ...input(),
      rawBase64: mutated.toString('base64'),
      declaredSha256: createHash('sha256').update(mutated).digest('hex'),
    });
    expect(result).toEqual({ status: 'unavailable', reason: 'source-registration' });
  });

  it.each(['*', `${rawBase64}=`, rawBase64.slice(1)])('拒绝非规范或损坏的 base64', (bad) => {
    expect(parseSzse2026HolidayNoticeV1({ ...input(), rawBase64: bad }).status).toBe('unavailable');
  });

  it.each([
    ['缺段', (html: string) => html.replace('（七）', '（八）')],
    ['重段', (html: string) => html.replace('（七）', '（六）')],
    ['错误星期', (html: string) => html.replace('1月1日（星期四）', '1月1日（星期五）')],
    ['越界复市', (html: string) => html.replace('1月5日（星期一）', '1月3日（星期六）')],
    ['正文署名缺失', (html: string) => html.replace('深圳证券交易所</span>', '未知交易所</span>')],
  ] as const)('结构提取拒绝 %s', (_name, mutate) => {
    const html = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    expect(() => extractSzse2026HolidayNoticeFactsV1(mutate(html))).toThrow();
  });
});
