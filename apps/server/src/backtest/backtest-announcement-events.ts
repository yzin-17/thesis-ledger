import { z } from 'zod';
import { marketAnnouncementsSchema, type MarketAnnouncements } from '@thesis-ledger/schemas';
import type { DsaClient } from '../integration/dsa/dsa.client.js';
import { SnapshotDependencyV3Error } from './backtest-snapshot-v3-dependency-error.js';
import type {
  DependencyRequest,
  SnapshotDependencyV3Input,
} from './backtest-snapshot-v3-dependencies.js';

type EventRequest = Extract<DependencyRequest, { purpose: 'corporateActions' }>;
export const announcementEvidenceKind = 'no-matching-action-announcements-v1';
export const announcementAssumptionSource = 'announcement-research-assumption';
const pageSize = 100;
const evidenceSchema = z.strictObject({
  kind: z.literal(announcementEvidenceKind),
  symbol: z.string(),
  start: z.iso.date(),
  end: z.iso.date(),
  pages: z.array(marketAnnouncementsSchema).nonempty(),
});

// 目录按披露日排列。生效日可能晚于披露日，因此也检查窗口开始前的公告。
const actionTitle =
  /分红|分派|派息|派现|现金股利|现金红利|股息|利润分配|权益分配|送股|送红股|转增|除权|除息|拆股|合股|拆细|拆分|并股|股份合并|股票合并|股本合并|股份分割|缩股/;

export function usesAnnouncementAssumption(
  input: SnapshotDependencyV3Input,
  request: EventRequest,
) {
  const protocol = input.runConfig.executionPriceProtocol;
  return (
    request.request.market === 'CN' &&
    request.request.instrumentType === 'STOCK' &&
    protocol.accountingBasis === 'raw-events' &&
    protocol.history.basis === 'fixed-provider-snapshot'
  );
}

function invalid(message: string): never {
  throw new SnapshotDependencyV3Error('event_plan_blocked', message);
}

function checkPage(
  page: MarketAnnouncements,
  number: number,
  total: number,
  symbol: string,
  end: string,
) {
  const expected = Math.min(pageSize, Math.max(total - (number - 1) * pageSize, 0));
  if (
    page.page !== number ||
    page.pageSize !== pageSize ||
    page.total !== total ||
    page.items.length !== expected ||
    page.items.some((item) => item.symbol !== symbol || item.publishedDate > end)
  )
    invalid('公司行动公告目录返回的标的、范围或分页不符。');
  if (
    page.items.some((item) => actionTitle.test(item.title) || actionTitle.test(item.detail ?? ''))
  )
    throw new SnapshotDependencyV3Error(
      'action_announcement_found',
      '查到可能相关的公司行动公告，需要核对生效日和事件事实。',
    );
}

export function parseAnnouncementEvidence(
  input: SnapshotDependencyV3Input,
  request: EventRequest,
  value: unknown,
) {
  const bundle = evidenceSchema.parse(value);
  if (
    !usesAnnouncementAssumption(input, request) ||
    bundle.symbol !== request.request.symbol ||
    bundle.start !== request.range.start ||
    bundle.end !== request.range.end
  )
    invalid('公司行动公告记录与回测窗口不一致。');
  const total = bundle.pages[0]!.total;
  if (bundle.pages.length !== Math.max(1, Math.ceil(total / pageSize)))
    invalid('公司行动公告目录缺页。');
  const ids = new Set<string>();
  for (const [index, page] of bundle.pages.entries()) {
    checkPage(page, index + 1, total, bundle.symbol, bundle.end);
    for (const item of page.items) ids.add(item.id);
  }
  if (ids.size !== total) invalid('公司行动公告目录含重复记录。');
  return bundle;
}

export async function readAnnouncementEvidence(request: EventRequest, dsa: Pick<DsaClient, 'get'>) {
  const pages: MarketAnnouncements[] = [];
  const { symbol } = request.request;
  const { start, end } = request.range;
  for (let number = 1; ; number++) {
    const params = new URLSearchParams({
      symbol,
      end,
      page: String(number),
      pageSize: String(pageSize),
    });
    const raw = await dsa.get<unknown>(`/api/v1/thesis-ledger/market/announcements?${params}`, 1);
    const page = marketAnnouncementsSchema.parse(raw);
    checkPage(page, number, pages[0]?.total ?? page.total, symbol, end);
    pages.push(page);
    if (number * pageSize >= page.total) break;
  }
  return { kind: announcementEvidenceKind, symbol, start, end, pages };
}

export function announcementAssumptionWarnings(
  rows: readonly { provider?: unknown }[] | undefined,
) {
  return rows?.some((row) => row.provider === announcementAssumptionSource)
    ? ['公告库未查到相关公告，本次回测按无现金分红、无拆并股处理。']
    : [];
}
