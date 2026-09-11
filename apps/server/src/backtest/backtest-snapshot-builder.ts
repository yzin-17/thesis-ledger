import { Injectable } from '@nestjs/common';
import type {
  BacktestCapabilities,
  BacktestCalendarResponse,
  BacktestCorporateActionsResponse,
  BacktestInstrumentFactsResponse,
  BacktestInstrumentType,
  BacktestMarket,
} from '@thesis-ledger/schemas';
import { runConfigSchemaV2, validateStrategyRunConfig } from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import {
  buildSnapshotManifest,
  canonicalizeManifest,
  hashCanonicalManifest,
  LocalSnapshotStore,
  type SnapshotManifest,
} from './backtest-snapshot.js';
import type { ArtifactPutInput, ArtifactRef, ArtifactRow } from './backtest-artifact-store.js';
import type { BacktestV2SnapshotBuilder } from './backtest-v2-run.js';
import {
  BacktestMarketRulesUnavailableError,
  requireFrozenExecutionRules,
} from './backtest-market-rules.js';

type DatasetInput = SnapshotManifest['dependencyClosure']['datasets'][number];

const instrumentType = (value: string): 'STOCK' | 'ETF' | 'NAV_FUND' => {
  if (value === 'fund') return 'NAV_FUND';
  if (value === 'etf') return 'ETF';
  return 'STOCK';
};

const parseInstrument = (value: string) => {
  const [market, symbol, assetType] = value.split(':');
  if (!market || !symbol || !assetType) throw new Error(`Snapshot dataset identity 无效: ${value}`);
  return { market, symbol, assetType };
};

const dependencyInstrument = (
  value: string,
): { symbol: string; market: BacktestMarket; instrumentType: BacktestInstrumentType } => {
  const parsed = parseInstrument(value);
  if (parsed.market !== 'CN' && parsed.market !== 'HK' && parsed.market !== 'US') {
    throw new Error(`Snapshot dataset market 无效: ${parsed.market}`);
  }
  return {
    symbol: parsed.symbol,
    market: parsed.market,
    instrumentType: instrumentType(parsed.assetType),
  };
};

const findCapability = (
  capabilities: BacktestCapabilities,
  dataset: DatasetInput,
  dataAsOf: string,
) => {
  const instrument = parseInstrument(dataset.instrument);
  const capability = capabilities.capabilities.find(
    (candidate) =>
      candidate.market === instrument.market &&
      candidate.instrumentType === instrumentType(instrument.assetType) &&
      candidate.timeframe === dataset.baseTimeframe,
  );
  if (!capability || capability.status !== 'supported') {
    throw new Error(
      `Snapshot capability unavailable: ${dataset.instrument}/${dataset.baseTimeframe}`,
    );
  }
  if (capability.availableAt && capability.availableAt > dataAsOf) {
    throw new Error(`Snapshot capability availableAt invalid: ${dataset.instrument}`);
  }
  return instrument;
};

const factAvailableAt = (value: unknown, dataAsOf: string, identity: string): void => {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`Snapshot fact availableAt invalid: ${identity}`);
  }
  if (Date.parse(value) > Date.parse(dataAsOf)) {
    throw new Error(`Snapshot fact is newer than dataAsOf: ${identity}`);
  }
};

const rowFromFact = (fact: Record<string, unknown>): ArtifactRow =>
  Object.fromEntries(
    Object.entries(fact).map(([key, value]) => [
      key,
      value === undefined ||
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
        ? (value ?? null)
        : JSON.stringify(value),
    ]),
  );

const factsForDataset = (
  capabilities: BacktestCapabilities,
  dataset: DatasetInput,
  dataAsOf: string,
): ArtifactRow[] => {
  const identity = dataset.instrument;
  let status: string | undefined;
  let facts: Record<string, unknown>[] = [];
  if (dataset.purpose === 'calendar') {
    facts = capabilities.calendars.filter((fact) => fact.market === identity);
  } else if (dataset.purpose === 'instrumentFacts') {
    const instrument = parseInstrument(identity);
    facts = capabilities.instrumentFacts.filter(
      (fact) =>
        fact.symbol === instrument.symbol &&
        fact.market === instrument.market &&
        fact.instrumentType === instrumentType(instrument.assetType),
    );
  } else if (dataset.purpose === 'corporateActions') {
    const instrument = parseInstrument(identity);
    status = capabilities.corporateActions.status;
    facts = capabilities.corporateActions.facts.filter(
      (fact) =>
        fact.symbol === instrument.symbol &&
        fact.market === instrument.market &&
        fact.instrumentType === instrumentType(instrument.assetType),
    );
  } else if (dataset.purpose === 'nav') {
    const instrument = parseInstrument(identity);
    status = capabilities.nav.status;
    facts = capabilities.nav.facts.filter(
      (fact) =>
        fact.symbol === instrument.symbol &&
        fact.market === instrument.market &&
        fact.instrumentType === instrumentType(instrument.assetType),
    );
  } else if (dataset.purpose === 'fx') {
    status = capabilities.fx.status;
    const [fromCurrency, toCurrency] = identity.split('/');
    facts = capabilities.fx.facts.filter(
      (fact) => fact.fromCurrency === fromCurrency && fact.toCurrency === toCurrency,
    );
  }
  if (status !== undefined && status !== 'supported')
    throw new Error(`Snapshot ${dataset.purpose} capability unavailable: ${identity}`);
  if (facts.length === 0)
    throw new Error(`Snapshot ${dataset.purpose} fact unavailable: ${identity}`);
  return facts.map((fact) => {
    factAvailableAt(fact.availableAt, dataAsOf, identity);
    return rowFromFact(fact);
  });
};

type DependencyResponse =
  BacktestCalendarResponse | BacktestInstrumentFactsResponse | BacktestCorporateActionsResponse;

const rowsFromDependencyResponse = (
  response: DependencyResponse,
  dataset: DatasetInput,
  dataAsOf: string,
  allowTrustedEmpty: boolean,
): { rows: ArtifactRow[]; emptyEvidence?: ArtifactRow } => {
  if (response.status !== 'supported' || !response.coverage.complete) {
    throw new Error(
      response.reason ?? `Snapshot ${dataset.purpose} coverage unavailable: ${dataset.instrument}`,
    );
  }
  const rows = response.facts.map((fact) => {
    factAvailableAt(fact.availableAt, dataAsOf, dataset.instrument);
    return rowFromFact(fact);
  });
  if (rows.length > 0) return { rows };
  if (!allowTrustedEmpty) {
    throw new Error(`Snapshot ${dataset.purpose} fact unavailable: ${dataset.instrument}`);
  }
  return {
    rows,
    emptyEvidence: {
      kind: 'empty-dataset',
      purpose: dataset.purpose,
      instrument: dataset.instrument,
      provider: response.provider,
      providerRevision: response.providerRevision,
      coverage: JSON.stringify(response.coverage),
    },
  };
};

@Injectable()
export class DsaSnapshotBuilder implements BacktestV2SnapshotBuilder {
  constructor(
    private readonly dsa: DsaClient,
    private readonly snapshots: LocalSnapshotStore,
  ) {}

  async build(input: Parameters<BacktestV2SnapshotBuilder['build']>[0]) {
    if (input.runConfig.executionModel) {
      input = structuredClone(input);
      input.runConfig = runConfigSchemaV2.parse(input.runConfig);
      const validation = validateStrategyRunConfig(input.strategy, input.runConfig);
      if (!validation.valid)
        throw new BacktestMarketRulesUnavailableError(
          validation.errors.map((error) => error.message).join('; '),
        );
    }
    const putArtifact = (artifact: Omit<ArtifactPutInput, 'key'> & { key: string }) =>
      this.snapshots.putArtifact(input.runId, {
        ...artifact,
        ...(input.runConfig.executionModel ? { artifactId: hashCanonicalManifest(artifact) } : {}),
      });
    const manifest = buildSnapshotManifest({
      ...input,
      quality: { completeness: 'complete', warnings: [] },
    });
    const existing = await this.snapshots.load(input.runId, true);
    if (existing?.status === 'finalized') {
      await this.snapshots.startBuild(input);
      const manifest = await this.snapshots.replay(input.runId);
      return {
        manifest,
        snapshotRef: { snapshotId: manifest.contentHash!, contentHash: manifest.contentHash! },
        artifactRefs: manifest.artifacts,
      };
    }
    if (input.runConfig.endDate > input.runConfig.dataAsOf.slice(0, 10)) {
      throw new Error('RunConfig endDate 不能晚于 dataAsOf');
    }
    const capabilities = await this.dsa.backtestCapabilities();
    const artifacts: ArtifactRef[] = [];
    try {
      const building = await this.snapshots.startBuild(input);
      artifacts.push(
        await putArtifact({
          key: 'metadata/snapshot-metadata.parquet',
          rows: [
            {
              kind: 'snapshot-metadata',
              strategy: input.runConfig.executionModel
                ? canonicalizeManifest(input.strategy)
                : JSON.stringify(input.strategy),
              runConfig: input.runConfig.executionModel
                ? canonicalizeManifest(input.runConfig)
                : JSON.stringify(input.runConfig),
            },
          ],
        }),
      );
      if (input.runConfig.executionModel) {
        artifacts.push(
          await putArtifact({
            key: 'metadata/execution-model.parquet',
            rows: [
              {
                kind: 'execution-model',
                model: canonicalizeManifest(input.runConfig.executionModel),
              },
            ],
          }),
        );
      }
      const datasets = manifest.dependencyClosure.datasets.filter((dataset) =>
        [
          'signal',
          'execution',
          'benchmark',
          'fx',
          'corporateActions',
          'calendar',
          'instrumentFacts',
          'nav',
        ].includes(dataset.purpose),
      );
      for (const dataset of datasets) {
        let rows: ArtifactRow[];
        let emptyEvidence: ArtifactRow | undefined;
        let artifactName = dataset.instrument.replaceAll(':', '-') + '.parquet';
        if (['signal', 'execution', 'benchmark'].includes(dataset.purpose)) {
          const parsed = parseInstrument(dataset.instrument);
          if (parsed.assetType === 'fund' && parsed.market === 'CN') {
            rows = factsForDataset(
              capabilities,
              { ...dataset, purpose: 'nav' },
              input.runConfig.dataAsOf,
            );
            artifactName = `${dataset.purpose}/${parsed.market}-${parsed.symbol}-1d.parquet`;
          } else {
            const instrument = findCapability(capabilities, dataset, input.runConfig.dataAsOf);
            const bars = await this.dsa.backtestBars({
              symbol: instrument.symbol,
              timeframe: dataset.baseTimeframe as '1m' | '1d',
              start: manifest.dateRange.warmupStartDate,
              end: manifest.dateRange.endDate,
            });
            if (bars.length === 0)
              throw new Error(`Snapshot bars unavailable: ${dataset.instrument}`);
            for (const bar of bars) {
              factAvailableAt(bar.availableAt, input.runConfig.dataAsOf, dataset.instrument);
            }
            rows = bars.map(
              (bar) =>
                Object.fromEntries(
                  Object.entries(bar).filter(([, value]) => value !== undefined),
                ) as ArtifactRow,
            );
            artifactName = `${dataset.purpose}/${instrument.market}-${instrument.symbol}-${dataset.baseTimeframe}.parquet`;
          }
        } else if (
          dataset.purpose === 'calendar' &&
          typeof this.dsa.backtestCalendar === 'function'
        ) {
          const result = rowsFromDependencyResponse(
            await this.dsa.backtestCalendar({
              market: dataset.instrument as BacktestMarket,
              start: manifest.dateRange.warmupStartDate,
              end: manifest.dateRange.endDate,
              dataAsOf: input.runConfig.dataAsOf,
            }),
            dataset,
            input.runConfig.dataAsOf,
            false,
          );
          rows = result.rows;
          if (
            input.runConfig.executionModel &&
            dataset.instrument === input.runConfig.executionModel.scope.market &&
            rows.some((row) => row.timezone !== input.runConfig.executionModel!.scope.timezone)
          ) {
            throw new BacktestMarketRulesUnavailableError('冻结 Calendar 时区与研究模型不一致');
          }
          artifactName = `${dataset.purpose}/${dataset.instrument}.parquet`;
        } else if (
          dataset.purpose === 'instrumentFacts' &&
          typeof this.dsa.backtestInstrumentFacts === 'function'
        ) {
          const instrument = dependencyInstrument(dataset.instrument);
          const response = await this.dsa.backtestInstrumentFacts({
            ...instrument,
            start: manifest.dateRange.warmupStartDate,
            end: manifest.dateRange.endDate,
            executionStart: manifest.dateRange.startDate,
            executionEnd: manifest.dateRange.endDate,
            dataAsOf: input.runConfig.dataAsOf,
          });
          if (response.status === 'unavailable') {
            throw new BacktestMarketRulesUnavailableError(
              response.reason ?? `缺少标的历史事实: ${instrument.symbol}`,
            );
          }
          const model = input.runConfig.executionModel;
          if (
            model &&
            dataset.instrument === manifest.dependencyClosure.executionInstrument &&
            response.facts.some(
              (fact) =>
                fact.symbol !== model.scope.symbol ||
                fact.market !== model.scope.market ||
                fact.instrumentType !== model.scope.instrumentType ||
                fact.currency !== model.scope.currency,
            )
          ) {
            throw new BacktestMarketRulesUnavailableError(
              'Provider 标的事实与研究模型适用范围不一致',
            );
          }
          const result = rowsFromDependencyResponse(
            response,
            dataset,
            input.runConfig.dataAsOf,
            false,
          );
          const usesSelectedExecutionModel =
            model && dataset.instrument === manifest.dependencyClosure.executionInstrument;
          if (!usesSelectedExecutionModel) {
            requireFrozenExecutionRules(
              response.facts[0]!.executionRules,
              manifest.marketRuleVersion,
              {
                start: manifest.dateRange.warmupStartDate,
                end: manifest.dateRange.endDate,
              },
            );
          }
          rows = result.rows;
          artifactName = `${dataset.purpose}/${instrument.market}-${instrument.symbol}.parquet`;
        } else if (
          dataset.purpose === 'corporateActions' &&
          typeof this.dsa.backtestCorporateActions === 'function'
        ) {
          const instrument = dependencyInstrument(dataset.instrument);
          const result = rowsFromDependencyResponse(
            await this.dsa.backtestCorporateActions({
              ...instrument,
              start: manifest.dateRange.warmupStartDate,
              end: manifest.dateRange.endDate,
              dataAsOf: input.runConfig.dataAsOf,
            }),
            dataset,
            input.runConfig.dataAsOf,
            true,
          );
          rows = result.rows;
          emptyEvidence = result.emptyEvidence;
          artifactName = `${dataset.purpose}/${instrument.market}-${instrument.symbol}.parquet`;
        } else {
          rows = factsForDataset(capabilities, dataset, input.runConfig.dataAsOf);
          artifactName = `${dataset.purpose}/${artifactName}`;
        }
        if (emptyEvidence) {
          artifacts.push(
            await putArtifact({
              key: `metadata/empty-${dataset.purpose}-${artifactName.replaceAll('/', '-')}`,
              rows: [emptyEvidence],
            }),
          );
          continue;
        }
        const artifact = await putArtifact({
          key: artifactName,
          rows,
        });
        artifacts.push(artifact);
      }
      if (artifacts.length === 0) throw new Error('Snapshot 未生成任何 Bar ArtifactRef');
      const finalized = await this.snapshots.finalize(input.runId, building, artifacts);
      if (!finalized.contentHash) throw new Error('Snapshot contentHash 缺失');
      return {
        manifest: finalized,
        snapshotRef: { snapshotId: finalized.contentHash, contentHash: finalized.contentHash },
        artifactRefs: finalized.artifacts,
      };
    } catch (error) {
      await this.snapshots.deleteRun(input.runId).catch(() => undefined);
      throw error;
    }
  }
}
