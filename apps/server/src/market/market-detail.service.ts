import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { normalizeSymbol } from '@thesis-ledger/domain';
import {
  marketDetailResponseSchema,
  type MarketDetailAssetType,
  type MarketDetailCapability,
  type MarketDetailDataByCapability,
  type MarketDetailDiagnostic,
  type MarketDetailResponse,
  type MarketDetailSection,
  type MarketDetailSectionStatus,
} from '@thesis-ledger/schemas';
import { ZodError } from 'zod';
import { PrismaService } from '../platform/prisma.service.js';
import { currentTraceId } from '../platform/structured-logger.js';
import { DsaError } from '../integration/dsa/dsa.client.js';
import { MarketControlService } from './market-control.service.js';
import { MarketService } from './market.service.js';

export const MARKET_DETAIL_CAPABILITIES = [
  'quote',
  'bars',
  'indicator:MA',
  'indicator:MACD',
  'indicator:RSI',
  'chip',
  'fund-nav',
  'fund-nav-history',
] as const satisfies readonly MarketDetailCapability[];

const STOCK_CAPABILITIES: readonly MarketDetailCapability[] = [
  'quote',
  'bars',
  'indicator:MA',
  'indicator:MACD',
  'indicator:RSI',
  'chip',
];
const ETF_CAPABILITIES: readonly MarketDetailCapability[] = [
  'quote',
  'bars',
  'indicator:MA',
  'indicator:MACD',
  'indicator:RSI',
];
const FUND_CAPABILITIES: readonly MarketDetailCapability[] = ['fund-nav', 'fund-nav-history'];

const POLICY_CAPABILITY_BY_DETAIL: Record<MarketDetailCapability, string> = {
  quote: 'REALTIME_QUOTE',
  bars: 'DAILY_BAR',
  'indicator:MA': 'DAILY_BAR',
  'indicator:MACD': 'DAILY_BAR',
  'indicator:RSI': 'DAILY_BAR',
  chip: 'CHIP_SUMMARY',
  'fund-nav': 'FUND_NAV',
  'fund-nav-history': 'FUND_NAV_HISTORY',
};

export const MARKET_DETAIL_CAPABILITY_MATRIX: Record<
  MarketDetailAssetType,
  readonly MarketDetailCapability[]
> = {
  STOCK: STOCK_CAPABILITIES,
  ETF: ETF_CAPABILITIES,
  MUTUAL_FUND: FUND_CAPABILITIES,
  UNKNOWN: [],
};

type DetailInclude = string | readonly string[] | undefined;
type DetailLimit = number | string | undefined;

type ResolvedIdentity = {
  symbol: string;
  assetType: MarketDetailAssetType;
  source: 'asset' | 'catalog' | 'symbol' | 'unknown';
  status: 'confirmed' | 'provider' | 'unknown';
};

type PolicySnapshot = {
  enabled: boolean;
  routes: Record<string, Record<string, string[]>>;
};

const assetTypeFromValue = (value: unknown): MarketDetailAssetType | null => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'STOCK') return 'STOCK';
  if (normalized === 'ETF') return 'ETF';
  if (normalized === 'FUND' || normalized === 'MUTUAL_FUND') return 'MUTUAL_FUND';
  return null;
};

const isIndicatorCapability = (value: MarketDetailCapability) => value.startsWith('indicator:');

const indicatorName = (value: MarketDetailCapability): 'MA' | 'MACD' | 'RSI' =>
  value.slice('indicator:'.length) as 'MA' | 'MACD' | 'RSI';

const hasStaleValue = (value: unknown, seen = new Set<unknown>()): boolean => {
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasStaleValue(item, seen));
  const record = value as Record<string, unknown>;
  if (record.stale === true || record.freshness === 'stale' || record.fallbackUsed === true)
    return true;
  return Object.values(record).some((item) => hasStaleValue(item, seen));
};

const isEmptyValue = (value: unknown) =>
  value === null || value === undefined || (Array.isArray(value) && value.length === 0);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizedPolicyRoutes = (
  value: unknown,
): Record<string, Record<string, string[]>> | null => {
  if (!isRecord(value)) return null;
  const result: Record<string, Record<string, string[]>> = {};
  for (const [capability, rawTypes] of Object.entries(value)) {
    if (!isRecord(rawTypes)) return null;
    const typeRoutes: Record<string, string[]> = {};
    for (const [assetType, providers] of Object.entries(rawTypes)) {
      if (!Array.isArray(providers) || !providers.every((provider) => typeof provider === 'string'))
        return null;
      typeRoutes[assetType] = providers;
    }
    result[capability] = typeRoutes;
  }
  return result;
};

@Injectable()
export class MarketDetailService {
  constructor(
    private readonly market: MarketService,
    private readonly control: MarketControlService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async getDetail(
    input: string,
    options: {
      include?: DetailInclude;
      barsLimit?: DetailLimit;
      navLimit?: DetailLimit;
      refresh?: boolean;
    } = {},
  ): Promise<MarketDetailResponse> {
    const barsLimit = this.parseLimit(options.barsLimit, 'barsLimit');
    const navLimit = this.parseLimit(options.navLimit, 'navLimit');
    const identity = await this.resolveIdentity(input);
    const baseSupported = MARKET_DETAIL_CAPABILITY_MATRIX[identity.assetType];
    const requested = this.parseInclude(options.include) ?? [...baseSupported];
    const policy =
      baseSupported.length > 0 ? await this.readPolicy() : ({ enabled: true, routes: {} } as const);
    const policyUnavailable = baseSupported.length > 0 && policy === null;
    const policyEnabledCapabilities = policyUnavailable
      ? []
      : baseSupported.filter((capability) =>
          this.policyAllows(policy, capability, identity.assetType),
        );
    const requestId = currentTraceId() ?? crypto.randomUUID();
    const refreshOptions = options.refresh === true ? { refresh: true } : {};
    const sections: Partial<Record<MarketDetailCapability, MarketDetailSection>> = {};
    const dependencies: Record<
      string,
      { status: MarketDetailSectionStatus; error?: MarketDetailDiagnostic }
    > = {};

    for (const capability of requested) {
      if (!baseSupported.includes(capability)) {
        sections[capability] = this.unsupportedSection(capability, requestId);
      } else if (policyUnavailable) {
        sections[capability] = this.unavailableSection(
          capability,
          requestId,
          'provider_policy_unavailable',
        );
      } else if (!policyEnabledCapabilities.includes(capability)) {
        sections[capability] = this.unavailableSection(
          capability,
          requestId,
          'capability_not_enabled',
        );
      }
    }

    const tasks: Array<Promise<void>> = [];
    const requestedIndicators = requested.filter(isIndicatorCapability);
    if (policyUnavailable && requestedIndicators.length > 0) {
      const firstIndicator = sections[requestedIndicators[0]!];
      dependencies.DAILY_BAR = {
        status: 'unavailable',
        ...(firstIndicator?.error ? { error: firstIndicator.error } : {}),
      };
    } else if (requestedIndicators.length > 0 && !policyEnabledCapabilities.includes('bars')) {
      const firstIndicator = sections[requestedIndicators[0]!];
      const error =
        firstIndicator?.error ??
        this.diagnostic(requestId, 'bars', 'capability_not_enabled');
      dependencies.DAILY_BAR = { status: 'unavailable', error };
      for (const capability of requestedIndicators) {
        sections[capability] = this.unavailableSection(
          capability,
          requestId,
          error.code,
          error,
        );
      }
    }

    const supportedRequested = requested.filter(
      (capability) => !policyUnavailable && policyEnabledCapabilities.includes(capability),
    );
    const indicatorRequested = supportedRequested.filter(isIndicatorCapability);
    const barsNeeded = supportedRequested.includes('bars') || indicatorRequested.length > 0;
    const barsPromise = barsNeeded
      ? this.loadSection('bars', requestId, async () => {
          const bars = await this.market.getBars(identity.symbol, '1d', undefined, {
            allowStale: true,
            ...refreshOptions,
          });
          return bars.slice(-barsLimit);
        })
      : null;

    if (supportedRequested.includes('quote')) {
      tasks.push(
        this.loadSection('quote', requestId, () =>
          this.market.getQuote(identity.symbol, { allowStale: true, ...refreshOptions }),
        ).then((section) => {
          sections.quote = section;
        }),
      );
    }
    if (supportedRequested.includes('chip')) {
      tasks.push(
        this.loadSection('chip', requestId, () =>
          this.market.getChip(identity.symbol, refreshOptions),
        ).then((section) => {
          sections.chip = section;
        }),
      );
    }
    if (supportedRequested.includes('fund-nav')) {
      tasks.push(
        this.loadSection('fund-nav', requestId, () =>
          this.market.getFundNav(identity.symbol, { allowStale: true, ...refreshOptions }),
        ).then((section) => {
          sections['fund-nav'] = section;
        }),
      );
    }
    if (supportedRequested.includes('fund-nav-history')) {
      tasks.push(
        this.loadSection('fund-nav-history', requestId, () =>
          this.market.getFundNavHistory(
            identity.symbol,
            { limit: navLimit },
            { ...refreshOptions, persistIdentity: false },
          ),
        ).then((section) => {
          sections['fund-nav-history'] = section;
        }),
      );
    }
    if (barsPromise && supportedRequested.includes('bars')) {
      tasks.push(
        barsPromise.then((section) => {
          sections.bars = section;
        }),
      );
    }

    if (barsPromise && indicatorRequested.length > 0) {
      const dependencyPromise = barsPromise.then((section) => {
        dependencies.DAILY_BAR = {
          status: section.status,
          ...(section.error ? { error: section.error } : {}),
        };
        return section;
      });
      for (const capability of indicatorRequested) {
        tasks.push(
          dependencyPromise
            .then(async (dependency) => {
              if (dependency.status === 'unavailable') {
                return this.unavailableSection(
                  capability,
                  requestId,
                  dependency.error?.code ?? 'daily_bar_unavailable',
                  dependency.error,
                );
              }
              if (dependency.status === 'empty') {
                return { capability, status: 'empty', data: null } satisfies MarketDetailSection;
              }
              const section = await this.loadSection(capability, requestId, () =>
                this.market.getIndicator(identity.symbol, indicatorName(capability), {
                  ...refreshOptions,
                }),
              );
              if (dependency.status === 'stale' && section.status === 'ready')
                return { ...section, status: 'stale' } satisfies MarketDetailSection;
              return section;
            })
            .then((section) => {
              sections[capability] = section;
            }),
        );
      }
    }

    await Promise.all(tasks);

    return marketDetailResponseSchema.parse({
      version: 1,
      symbol: identity.symbol,
      assetType: identity.assetType,
      identity: { source: identity.source, status: identity.status },
      requested,
      capabilities: {
        supported: [...baseSupported],
        unsupported: MARKET_DETAIL_CAPABILITIES.filter(
          (capability) => !baseSupported.includes(capability),
        ),
      },
      limits: { bars: barsLimit, nav: navLimit },
      sections,
      dependencies,
      requestId,
      generatedAt: new Date().toISOString(),
    });
  }

  private async readPolicy(): Promise<PolicySnapshot | null> {
    try {
      const raw = (await this.control.getPolicy()) as unknown as Record<string, unknown>;
      const projection = isRecord(raw.effectiveProjection) ? raw.effectiveProjection : null;
      const source = projection ?? raw;
      const routes = normalizedPolicyRoutes(source.routes);
      const applied = projection !== null || raw.syncState === 'applied';
      if (!applied || typeof source.enabled !== 'boolean' || routes === null) return null;
      return { enabled: source.enabled, routes };
    } catch {
      return null;
    }
  }

  private policyAllows(
    policy: PolicySnapshot | null,
    capability: MarketDetailCapability,
    assetType: MarketDetailAssetType,
  ) {
    if (!policy || !policy.enabled) return false;
    const route = policy.routes[POLICY_CAPABILITY_BY_DETAIL[capability]]?.[assetType];
    return Array.isArray(route) && route.length > 0;
  }

  private async resolveIdentity(input: string): Promise<ResolvedIdentity> {
    let normalized: ReturnType<typeof normalizeSymbol>;
    try {
      normalized = normalizeSymbol(input);
    } catch {
      throw new BadRequestException('非法行情标的代码');
    }

    if (this.prisma) {
      const asset = await this.readAsset(normalized.symbol);
      const assetType = assetTypeFromValue(asset?.assetType);
      if (assetType) {
        return {
          symbol: normalized.symbol,
          assetType,
          source: 'asset',
          status: asset?.identityStatus === 'confirmed' ? 'confirmed' : 'provider',
        };
      }

      const association = await this.readAssociation(normalized.symbol);
      const associationType = assetTypeFromValue(association?.instrument?.instrumentType);
      if (associationType) {
        return {
          symbol: normalized.symbol,
          assetType: associationType,
          source: 'catalog',
          status: 'confirmed',
        };
      }

      const instrument = await this.readInstrument(normalized.code, normalized.market);
      const instrumentType = assetTypeFromValue(instrument?.instrumentType);
      if (instrumentType) {
        return {
          symbol: normalized.symbol,
          assetType: instrumentType,
          source: 'catalog',
          status: 'provider',
        };
      }

      return {
        symbol: normalized.symbol,
        assetType: 'UNKNOWN',
        source: 'unknown',
        status: 'unknown',
      };
    }

    return {
      symbol: normalized.symbol,
      assetType: 'UNKNOWN',
      source: 'unknown',
      status: 'unknown',
    };
  }

  private async readAsset(symbol: string) {
    try {
      return await this.prisma?.asset.findUnique({
        where: { symbol },
        select: { assetType: true, identityStatus: true },
      });
    } catch {
      throw new ServiceUnavailableException('资产身份暂时不可用，请稍后重试。');
    }
  }

  private async readAssociation(symbol: string) {
    try {
      const association = await this.prisma?.instrumentAssetAssociation.findUnique({
        where: { symbol },
        include: { instrument: true },
      });
      if (
        !association ||
        association.status !== 'active' ||
        association.confirmedAt === null ||
        association.instrument.active !== true
      )
        return null;
      return association;
    } catch {
      throw new ServiceUnavailableException('资产身份暂时不可用，请稍后重试。');
    }
  }

  private async readInstrument(canonicalCode: string, market: string) {
    try {
      return await this.prisma?.instrument.findFirst({
        where: { canonicalCode, market, active: true },
        orderBy: { generation: 'desc' },
      });
    } catch {
      throw new ServiceUnavailableException('资产身份暂时不可用，请稍后重试。');
    }
  }

  private parseInclude(input: DetailInclude): MarketDetailCapability[] | undefined {
    if (input === undefined) return undefined;
    const values = (Array.isArray(input) ? input : [input])
      .flatMap((value) => String(value).split(','))
      .map((value) => value.trim())
      .filter(Boolean);
    if (values.length === 0) throw new BadRequestException('include 至少需要一个合法能力');
    const unique = [...new Set(values)];
    const invalid = unique.filter(
      (value) => !(MARKET_DETAIL_CAPABILITIES as readonly string[]).includes(value),
    );
    if (invalid.length > 0)
      throw new BadRequestException(`不支持的行情详情能力: ${invalid.join(', ')}`);
    return unique as MarketDetailCapability[];
  }

  private parseLimit(input: DetailLimit, field: 'barsLimit' | 'navLimit') {
    if (input === undefined) return 30;
    const limit = typeof input === 'number' ? input : Number(input);
    if (!Number.isInteger(limit) || limit < 1 || limit > 90)
      throw new BadRequestException(`${field} 必须是 1 到 90 之间的整数`);
    return limit;
  }

  private async loadSection<Capability extends MarketDetailCapability>(
    capability: Capability,
    requestId: string,
    loader: () => Promise<MarketDetailDataByCapability[Capability]>,
  ): Promise<MarketDetailSection> {
    try {
      const data = await loader();
      const status = this.statusForData(data);
      return { capability, status, data } as MarketDetailSection;
    } catch (error) {
      return this.unavailableSection(capability, requestId, this.errorCode(error));
    }
  }

  private unsupportedSection(
    capability: MarketDetailCapability,
    requestId: string,
    code = 'capability_unsupported',
  ): MarketDetailSection {
    return {
      capability,
      status: 'unsupported',
      error: this.diagnostic(requestId, capability, code),
    };
  }

  private unavailableSection(
    capability: MarketDetailCapability,
    requestId: string,
    code: string,
    diagnostic?: MarketDetailDiagnostic,
  ): MarketDetailSection {
    return {
      capability,
      status: 'unavailable',
      error: diagnostic ?? this.diagnostic(requestId, capability, code),
    };
  }

  private errorCode(error: unknown) {
    if (error instanceof DsaError) {
      if (error.code === 'timeout') return 'market_data_timeout';
      if (error.code === 'unauthorized') return 'market_data_unauthorized';
      if (error.code === 'invalid-response') return 'market_data_contract_invalid';
      return 'market_data_unavailable';
    }
    if (error instanceof ZodError) return 'market_data_contract_invalid';
    return 'market_data_unavailable';
  }

  private statusForData(data: unknown): MarketDetailSectionStatus {
    if (isEmptyValue(data)) return 'empty';
    if (hasStaleValue(data)) return 'stale';
    return 'ready';
  }

  private diagnostic(requestId: string, capability: MarketDetailCapability, code: string) {
    const messageByCode: Record<string, string> = {
      capability_unsupported: '当前资产类型不支持该行情能力。',
      capability_not_enabled: '当前数据策略未启用该行情能力。',
      provider_policy_unavailable: '当前数据策略暂时不可用，请稍后重试。',
      market_data_timeout: '行情数据源响应超时，请稍后重试。',
      market_data_unauthorized: '行情数据源暂时无法访问，请联系支持人员。',
      market_data_contract_invalid: '行情数据格式暂时不可用，请稍后重试。',
      daily_bar_unavailable: '技术指标依赖的日线数据暂时不可用。',
      market_data_unavailable: '当前行情暂时不可用，请稍后重试。',
    };
    const message = messageByCode[code] ?? '当前行情暂时不可用，请稍后重试。';
    return {
      code,
      message,
      diagnosticId: `${requestId}:${capability}:${crypto.randomUUID()}`,
      requestId,
    };
  }
}
