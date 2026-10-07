import { createHash } from 'node:crypto';

export const SZSE_2026_HOLIDAY_NOTICE_V1 = Object.freeze({
  originUri: 'https://www.szse.cn/disclosure/notice/t20251222_618087.html',
  publisher: '深圳证券交易所',
  rawBytes: 24_892,
  rawSha256: 'adfcdc1c285121a58ad3a55060a7125812d542cf9fdb92058aac1b1bc99c8243',
});

type Range = { name: string; start: string; end: string; reopens: string };
type Facts = { noticeDate: string; ranges: Range[]; closedWeekdays: string[] };
type Input = {
  originUri: string;
  publisher: string;
  declaredSha256: string;
  rawBase64: string;
};
type Result =
  ({ status: 'holiday-notice-verified' } & Facts) | { status: 'unavailable'; reason: string };

const weekdayNames = '日一二三四五六';
const holidayNames = ['元旦', '春节', '清明节', '劳动节', '端午节', '中秋节', '国庆节'];
const labels = '一二三四五六七';
const rowPattern =
  /^（([一二三四五六七])）([^：]+)：(\d{1,2})月(\d{1,2})日（星期([日一二三四五六])）至(\d{1,2})月(\d{1,2})日（星期([日一二三四五六])）休市，(\d{1,2})月(\d{1,2})日（星期([日一二三四五六])）起照常开市。(另外，.+为周末休市。)?$/;

function dateFromNotice(month: string, day: string, weekday: string): string {
  const value = new Date(Date.UTC(2026, Number(month) - 1, Number(day)));
  if (
    value.getUTCFullYear() !== 2026 ||
    value.getUTCMonth() !== Number(month) - 1 ||
    value.getUTCDate() !== Number(day) ||
    weekdayNames[value.getUTCDay()] !== weekday
  )
    throw new Error('notice-date');
  return value.toISOString().slice(0, 10);
}

function firstWeekdayAfter(date: string): string {
  let day = Date.parse(date) + 86_400_000;
  while ([0, 6].includes(new Date(day).getUTCDay())) day += 86_400_000;
  return new Date(day).toISOString().slice(0, 10);
}

function parseHolidayRow(row: string, index: number): Range {
  const match = rowPattern.exec(row);
  if (!match || match[1] !== labels[index] || match[2] !== holidayNames[index])
    throw new Error('notice-holiday-row');
  const start = dateFromNotice(match[3]!, match[4]!, match[5]!);
  const end = dateFromNotice(match[6]!, match[7]!, match[8]!);
  const reopens = dateFromNotice(match[9]!, match[10]!, match[11]!);
  if (start > end || reopens !== firstWeekdayAfter(end)) throw new Error('notice-holiday-range');
  const extra = match[12];
  if (extra) {
    const weekendDates = [...extra.matchAll(/(\d{1,2})月(\d{1,2})日（星期([日一二三四五六])）/g)];
    if (!weekendDates.length) throw new Error('notice-weekend');
    for (const [, month, day, weekday] of weekendDates) {
      const date = dateFromNotice(month!, day!, weekday!);
      if (![0, 6].includes(new Date(date).getUTCDay())) throw new Error('notice-weekend');
    }
  }
  return { name: match[2]!, start, end, reopens };
}

function noticeParagraphs(html: string): string[] {
  const marker = '<div class="des-content" id="desContent">';
  const start = html.indexOf(marker);
  if (start < 0 || html.indexOf(marker, start + marker.length) !== -1)
    throw new Error('notice-body');
  const end = html.indexOf('</div>', start + marker.length);
  if (end < 0) throw new Error('notice-body');
  // 原文摘要已固定；该容器的段落只含 span/o:p 排版标签。
  return [...html.slice(start + marker.length, end).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(
    ([, content]) =>
      content!
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s/g, ''),
  );
}

export function extractSzse2026HolidayNoticeFactsV1(html: string): Facts {
  if (
    html.split('<h2 class="title">关于2026年部分节假日休市安排的通知</h2>').length !== 2 ||
    html.split('<div class="time">时间：<span>2025-12-22</span></div>').length !== 2
  )
    throw new Error('notice-header');
  const paragraphs = noticeParagraphs(html);
  if (
    paragraphs.filter((row) => row === '深圳证券交易所').length !== 1 ||
    paragraphs.filter((row) => row === '2025年12月22日').length !== 1
  )
    throw new Error('notice-publisher');
  const rows = paragraphs.filter((row) => /^（[一二三四五六七八九]）/.test(row));
  if (rows.length !== 7) throw new Error('notice-holiday-count');
  const ranges = rows.map(parseHolidayRow);
  const closedWeekdays: string[] = [];
  for (const [index, range] of ranges.entries()) {
    if (index && range.start <= ranges[index - 1]!.end) throw new Error('notice-holiday-order');
    for (let day = Date.parse(range.start); day <= Date.parse(range.end); day += 86_400_000) {
      if (![0, 6].includes(new Date(day).getUTCDay()))
        closedWeekdays.push(new Date(day).toISOString().slice(0, 10));
    }
  }
  return { noticeDate: '2025-12-22', ranges, closedWeekdays };
}

function decodePinnedRaw(input: Input): string {
  const registration = SZSE_2026_HOLIDAY_NOTICE_V1;
  if (
    input.originUri !== registration.originUri ||
    input.publisher !== registration.publisher ||
    input.declaredSha256 !== registration.rawSha256
  )
    throw new Error('source-registration');
  if (
    input.rawBase64.length > 4 * Math.ceil(registration.rawBytes / 3) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.rawBase64)
  )
    throw new Error('source-base64');
  const bytes = Buffer.from(input.rawBase64, 'base64');
  if (bytes.toString('base64') !== input.rawBase64) throw new Error('source-base64');
  if (
    bytes.length !== registration.rawBytes ||
    createHash('sha256').update(bytes).digest('hex') !== registration.rawSha256
  )
    throw new Error('source-raw-hash');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function parseSzse2026HolidayNoticeV1(input: Input): Result {
  try {
    return {
      status: 'holiday-notice-verified',
      ...extractSzse2026HolidayNoticeFactsV1(decodePinnedRaw(input)),
    };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'source-invalid',
    };
  }
}
