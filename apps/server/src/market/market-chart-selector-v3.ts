import {
  assessMarketRouteCompatibilityV3,
  marketChartBarsRequestV3Schema,
  marketChartBarsRequestResponseV3Schema,
  marketRouteCompatibilityObservationV3Schema,
  marketRouteCompatibilityProofV3Schema,
  type MarketChartBarsRequestV3,
} from '@thesis-ledger/schemas';
import type {
  marketRouteContextV3,
  MarketWindowSelectionInputV3,
} from './market-window-selector-v3.js';
import { supportsBasicPriceFallback } from './market-basic-price-fallback.js';

type Context = Extract<ReturnType<typeof marketRouteContextV3>, { ok: true }>['context'];
class ChartPolicyChangedError extends Error {}

/** 基础价格图表允许同口径整窗回退；扩展来源继续读取服务端兼容记录。 */
export async function selectChartWindowV3(input: {
  request: Omit<MarketChartBarsRequestV3, 'routeTarget'>;
  context: Context;
  compatibility?: MarketWindowSelectionInputV3['compatibility'];
  resolveCompatibility?: () => Promise<MarketWindowSelectionInputV3['compatibility'] | null>;
  read: (request: MarketChartBarsRequestV3) => Promise<unknown>;
  now?: () => string;
}) {
  const now = input.now ?? (() => new Date().toISOString());
  const [primary, backup] = input.context.targets;
  const acquire = async (target: Context['targets'][number]) => {
    if (!target.eligible || !target.catalogReady) throw new Error('图表 V3 来源尚未准入');
    const request = marketChartBarsRequestV3Schema.parse({
      ...input.request,
      routeTarget: { ...target.target, routeIndex: target.routeIndex },
    });
    const response = marketChartBarsRequestResponseV3Schema.parse({
      request,
      response: await input.read(request),
    }).response;
    if (response.provenance.effectivePolicyRevision !== input.context.effectivePolicyRevision) {
      throw new ChartPolicyChangedError('图表 V3 读取期间路由修订已改变');
    }
    return response;
  };
  if (!primary) throw new Error('图表 V3 主来源尚未准入');
  try {
    return await acquire(primary);
  } catch (primaryError) {
    if (primaryError instanceof ChartPolicyChangedError) throw primaryError;
    if (!backup || !backup.eligible || !backup.catalogReady) throw primaryError;
    if (supportsBasicPriceFallback(input.request.routeKey, [primary.target, backup.target])) {
      return acquire(backup);
    }
    const compatibility = input.resolveCompatibility
      ? await input.resolveCompatibility()
      : input.compatibility;
    if (!compatibility) throw primaryError;
    const proof = marketRouteCompatibilityProofV3Schema.safeParse(compatibility.proof);
    const observed = marketRouteCompatibilityObservationV3Schema.safeParse(
      compatibility.observation,
    );
    if (
      !proof.success ||
      !observed.success ||
      proof.data.verification.kind !== 'verified-equivalence'
    ) {
      throw new Error('图表 V3 备用来源缺少可执行的等价证明', { cause: primaryError });
    }
    const observation = {
      ...observed.data,
      routeKey: input.request.routeKey,
      symbol: input.request.symbol,
      window: { start: input.request.start, end: input.request.end },
      targets: { primary: primary.target, backup: backup.target },
    };
    // Validate audited observations against the proof before binding this exact request.
    for (const candidate of [observed.data, observation]) {
      const assessment = assessMarketRouteCompatibilityV3({
        proof: proof.data,
        observation: candidate,
        now: now(),
      });
      if (!assessment.eligible) throw new Error(`图表 V3 备用基准不可用：${assessment.reason}`);
    }
    const response = await acquire(backup);
    const assessment = assessMarketRouteCompatibilityV3({
      proof: proof.data,
      observation: {
        ...observation,
        sourceFacts: {
          ...observation.sourceFacts,
          backup: {
            ...observation.sourceFacts.backup,
            seriesFingerprint: response.inputFingerprint,
            priceBasis: response.sourcePriceBasis,
          },
        },
      },
      now: now(),
    });
    if (!assessment.eligible) throw new Error(`图表 V3 备用基准不可用：${assessment.reason}`);
    if (input.resolveCompatibility) {
      const refreshed = await input.resolveCompatibility();
      const refreshedProof = marketRouteCompatibilityProofV3Schema.safeParse(refreshed?.proof);
      const refreshedObservation = marketRouteCompatibilityObservationV3Schema.safeParse(
        refreshed?.observation,
      );
      if (
        !refreshedProof.success ||
        !refreshedObservation.success ||
        JSON.stringify(refreshedProof.data) !== JSON.stringify(proof.data) ||
        JSON.stringify(refreshedObservation.data) !== JSON.stringify(observed.data)
      ) {
        throw new Error('图表 V3 备用证明已撤销或发生变化');
      }
    }
    return response;
  }
}
