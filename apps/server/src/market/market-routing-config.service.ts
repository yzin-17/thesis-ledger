import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  marketRouteKeyIdV3,
  routingAuthoringSchema,
  routingConfigInputSchema,
  type RoutingAuthoring,
  type RoutingConfigView,
  type RoutingConfigPreview,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import {
  applyDesiredProviderPolicyV3,
  marketPolicyCatalogResponse,
  readMarketRouteCatalogV3,
} from './market-policy-catalog.js';
import {
  buildMarketPolicyPayload,
  decodeMarketPolicyRoutes,
  persistMarketPolicyRevision,
} from './market-policy-storage.js';
import { compileRoutingConfig, preserveCompiledBindings } from './market-routing-compiler.js';
import { inferRoutingConfig } from './market-routing-rules.js';
import { normalizeRoutingInheritance } from './market-routing-normalization.js';

@Injectable()
export class MarketRoutingConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dsa: DsaClient,
  ) {}

  private async snapshot() {
    const [row, catalog] = await Promise.all([
      this.prisma.desiredProviderPolicy.findUniqueOrThrow({ where: { consumer: 'thesis-ledger' } }),
      readMarketRouteCatalogV3(this.dsa),
    ]);
    const routes = decodeMarketPolicyRoutes(row.routes);
    const raw = row.routes as Record<string, unknown>;
    const stored = routingAuthoringSchema.safeParse(raw.routingConfig);
    if (raw.routingConfig !== undefined && !stored.success)
      throw new ConflictException('分级路由元数据无效，请先核对存储版本');
    const originalConfig = stored.success
      ? stored.data
      : inferRoutingConfig(
          { enabled: row.enabled, routes },
          catalog.entries.map((entry) => entry.key),
        );
    const { config, legacyRuleCount } = normalizeRoutingInheritance(originalConfig);
    return { row, catalog, config, routes, legacyRuleCount };
  }

  async read(): Promise<RoutingConfigView> {
    const { row, catalog, config, routes, legacyRuleCount } = await this.snapshot();
    const compiled = compileRoutingConfig(config, catalog.entries);
    const before = new Map(
      routes.map((route) => [marketRouteKeyIdV3(route.key), JSON.stringify(route.targets)]),
    );
    const after = new Map(
      compiled.routes.map((route) => [
        marketRouteKeyIdV3(route.key),
        JSON.stringify(route.targets),
      ]),
    );
    const pendingChanges = [...new Set([...before.keys(), ...after.keys()])].filter(
      (id) => before.get(id) !== after.get(id),
    ).length;
    const ids = new Set(config.keys.map(marketRouteKeyIdV3));
    const newKeys = [
      ...new Map(
        catalog.entries
          .filter((entry) => !ids.has(marketRouteKeyIdV3(entry.key)))
          .map((entry) => [marketRouteKeyIdV3(entry.key), entry.key]),
      ).values(),
    ];
    return {
      legacyRuleCount,
      revision: row.revision,
      catalogRevision: catalog.catalogRevision,
      catalogStatus: catalog.status,
      config,
      diagnostics: compiled.diagnostics,
      pendingChanges,
      newKeys,
      syncState: row.syncState,
    };
  }

  private async prepare(input: unknown) {
    const parsed = routingConfigInputSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('分级路由配置无效');
    const snapshot = await this.snapshot();
    const { row, catalog } = snapshot;
    if (row.revision !== parsed.data.expectedRevision)
      throw new ConflictException('配置已改变，请重新读取并核对草稿');
    if (catalog.status !== 'complete' || catalog.catalogRevision !== parsed.data.catalogRevision)
      throw new ConflictException('能力目录已改变或不可用，请刷新后重新预览');
    const allowed = new Set(
      [...snapshot.config.keys, ...catalog.entries.map((entry) => entry.key)].map(
        marketRouteKeyIdV3,
      ),
    );
    const normalized = normalizeRoutingInheritance({
      ...parsed.data.config,
      preserved: snapshot.config.preserved,
    });
    const config: RoutingAuthoring = normalized.config;
    const legacyRuleCount = Math.max(snapshot.legacyRuleCount, normalized.legacyRuleCount);
    const ids = config.keys.map(marketRouteKeyIdV3);
    if (new Set(ids).size !== ids.length || ids.some((id) => !allowed.has(id)))
      throw new BadRequestException('精确能力范围无效');
    const compiled = compileRoutingConfig(config, catalog.entries);
    const previous = new Map(
      snapshot.routes.map((route) => [marketRouteKeyIdV3(route.key), route]),
    );
    const next = new Map(compiled.routes.map((route) => [marketRouteKeyIdV3(route.key), route]));
    const keys = new Map(
      [...snapshot.routes, ...compiled.routes].map((route) => [
        marketRouteKeyIdV3(route.key),
        route.key,
      ]),
    );
    const changes: RoutingConfigPreview['changes'] = [];
    for (const [id, key] of keys) {
      const before =
        previous
          .get(id)
          ?.targets.map((target) => `${target.providerId} · ${target.upstreamSource}`) ?? [];
      const after =
        next.get(id)?.targets.map((target) => `${target.providerId} · ${target.upstreamSource}`) ??
        [];
      if (JSON.stringify(before) !== JSON.stringify(after))
        changes.push({ key, previous: before, next: after });
    }
    const previewToken = createHash('sha256')
      .update(
        JSON.stringify({
          revision: row.revision,
          legacyRuleCount,
          catalogRevision: catalog.catalogRevision,
          rules: config.rules,
          keys: config.keys,
          routes: compiled.routes,
        }),
      )
      .digest('hex');
    const preview: RoutingConfigPreview = {
      legacyRuleCount,
      ...compiled,
      previewToken,
      changes,
      exceptions: config.rules.filter((rule) => rule.scope.market).length,
    };
    return { ...snapshot, config, preview, input: parsed.data };
  }

  async preview(input: unknown) {
    return (await this.prepare(input)).preview;
  }

  async save(input: unknown) {
    const prepared = await this.prepare(input);
    if (prepared.input.previewToken !== prepared.preview.previewToken)
      throw new ConflictException('请先预览当前草稿后再保存');
    const policy = buildMarketPolicyPayload(
      {
        contractVersion: 3,
        enabled: true,
        routes: prepared.preview.routes,
        requestId: randomUUID(),
      },
      prepared.row.revision + 1,
    );
    const config = preserveCompiledBindings(prepared.config, policy.routes);
    const current = await persistMarketPolicyRevision(
      this.prisma,
      policy,
      prepared.row.revision,
      config,
    );
    return marketPolicyCatalogResponse(
      await applyDesiredProviderPolicyV3(this.prisma, this.dsa, policy, current),
    );
  }
}
