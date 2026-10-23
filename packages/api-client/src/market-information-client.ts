import {
  marketNewsReadInputSchema,
  marketNewsReadResultSchema,
  correlateMarketNewsRead,
  marketNewsFeedReadInputSchema,
  marketNewsFeedReadResultSchema,
  correlateMarketNewsFeedRead,
  securityStaticSymbolSchema,
  securityStaticAssetTypeSchema,
  securityStaticInfoResponseSchema,
  securityLotSymbolSchema,
  securityLotSizeResponseSchema,
  quoteSchema,
  marketAnnouncementQuerySchema,
  marketAnnouncementsSchema,
  type MarketNewsReadInput,
  type MarketNewsFeedReadInput,
  type SecurityStaticAssetType,
  type MarketAnnouncementQuery,
} from '@thesis-ledger/schemas';
import { ThesisLedgerContractError } from './api-error.js';
type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
type Request = <T>(path: string, schema: Schema<T>, init?: RequestInit) => Promise<T>;
export function marketInformationClient(request: Request) {
  return {
    async getNews(input: MarketNewsReadInput, signal?: AbortSignal) {
      const checked = marketNewsReadInputSchema.parse(input);
      const path = '/api/market-data/news';
      const value = await request(path, marketNewsReadResultSchema, {
        method: 'POST',
        body: JSON.stringify(checked),
        ...(signal ? { signal } : {}),
      });
      try {
        return correlateMarketNewsRead(checked, value);
      } catch {
        throw new ThesisLedgerContractError(path);
      }
    },
    async getNewsFeed(input: MarketNewsFeedReadInput, signal?: AbortSignal) {
      const checked = marketNewsFeedReadInputSchema.parse(input);
      const path = '/api/market-data/news-feed';
      const value = await request(path, marketNewsFeedReadResultSchema, {
        method: 'POST',
        body: JSON.stringify(checked),
        ...(signal ? { signal } : {}),
      });
      try {
        return correlateMarketNewsFeedRead(checked, value);
      } catch {
        throw new ThesisLedgerContractError(path);
      }
    },
    getSecurityStaticInfo(
      symbol: string,
      assetType: SecurityStaticAssetType,
      signal?: AbortSignal,
    ) {
      const canonical = securityStaticSymbolSchema.parse(symbol);
      const type = securityStaticAssetTypeSchema.parse(assetType);
      return request(
        `/api/market-data/security-static-info?symbol=${encodeURIComponent(canonical)}&assetType=${type}`,
        securityStaticInfoResponseSchema.refine(
          (value) => value.symbol === canonical && value.assetType === type,
        ),
        signal ? { signal } : undefined,
      );
    },
    getSecurityQuote(symbol: string, assetType: SecurityStaticAssetType, signal?: AbortSignal) {
      const canonical = securityStaticSymbolSchema.parse(symbol);
      const type = securityStaticAssetTypeSchema.parse(assetType);
      return request(
        `/api/market/${encodeURIComponent(canonical)}/quote?assetType=${type}`,
        quoteSchema.refine((value) => value.symbol === canonical),
        signal ? { signal } : undefined,
      );
    },
    getSecurityLotSize(symbol: string, signal?: AbortSignal) {
      const canonical = securityLotSymbolSchema.parse(symbol);
      return request(
        `/api/market-data/security-lot-size?symbol=${encodeURIComponent(canonical)}`,
        securityLotSizeResponseSchema.refine((value) => value.symbol === canonical),
        signal ? { signal } : undefined,
      );
    },
    getAnnouncements(input: MarketAnnouncementQuery = {}, signal?: AbortSignal) {
      const params = marketAnnouncementQuerySchema.parse(input);
      const suffix = new URLSearchParams({
        q: params.q,
        page: String(params.page),
        pageSize: String(params.pageSize),
      });
      return request(
        `/api/market-data/announcements?${suffix}`,
        marketAnnouncementsSchema.refine(
          (value) => value.page === params.page && value.pageSize === params.pageSize,
        ),
        signal ? { signal } : undefined,
      );
    },
  };
}
