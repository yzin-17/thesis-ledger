import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { protectionSnapshot, protectionStrategy } from './protection-snapshot.fixture.js';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';

it.each(['frozen-atr', 'current-atr', 'unconditional-stop', 'armed-stop'] as const)(
  '正式冻结Worker与回放：%s 从原配置得出不同保护时点',
  async (kind) => {
    const exportDirectory = process.env.BACKTEST_PROTECTION_FIXED_DIR;
    if (exportDirectory) {
      expect(resolve(exportDirectory)).toContain('/thesis-ledger/var/acceptance/');
      await mkdir(exportDirectory, { recursive: true, mode: 0o700 });
    }
    const root = exportDirectory
      ? join(exportDirectory, kind + '-snapshot')
      : await mkdtemp(join(tmpdir(), 'backtest-protection-'));
    try {
      const fixture = await protectionSnapshot(root, kind);
      const execution = fixture.execute();
      expect(execution.fills.map((f) => f.side)).toEqual(['buy', 'sell']);
      const soldOn = {
        'frozen-atr': '2026-05-28',
        'current-atr': '2026-05-26',
        'unconditional-stop': '2026-05-21',
        'armed-stop': '2026-05-26',
      }[kind];
      expect(execution.fills[1]!.occurredAt).toContain(soldOn);
      const result = await fixture.run();
      expect(await fixture.run()).toEqual(result);
      expect(fixture.execute()).toEqual(execution);
      expect(fixture.fixture.reader.readV3).toHaveBeenCalled();
      if (exportDirectory) {
        const configuration = fixture.fixture.input.strategy;
        const opposite = {
          'frozen-atr': 'current-atr',
          'current-atr': 'frozen-atr',
          'unconditional-stop': 'armed-stop',
          'armed-stop': 'unconditional-stop',
        } as const;
        await writeFile(
          join(exportDirectory, kind + '.json'),
          JSON.stringify(
            {
              evidenceKind: 'fixed_fixture',
              category: 'passed',
              configuration,
              beforeConfiguration: await protectionStrategy(opposite[kind]),
              differences: [],
              readback: backtestStrategyPlanReadback(configuration),
              result,
              execution,
              modelCalls: 0,
            },
            null,
            2,
          ),
          { mode: 0o600, flag: 'wx' },
        );
      }
    } finally {
      if (!exportDirectory) await rm(root, { recursive: true, force: true });
    }
  },
  30000,
);

it.each(['research', 'actual'] as const)(
  '具名策略按%s坐标冻结执行，保留原模型定义',
  async (coordinate) => {
    const root = await mkdtemp(join(tmpdir(), 'backtest-protection-coordinate-'));
    try {
      const kind = coordinate === 'research' ? 'current-atr' : 'unconditional-stop';
      const strategy = await protectionStrategy(kind);
      strategy.schemaVersion = 'strategy-definition-v1';
      for (const source of strategy.signalSources) source.priceCoordinate = coordinate;
      const before = structuredClone(strategy);
      const fixture = await protectionSnapshot(root, kind, strategy);
      expect(fixture.fixture.input.strategy).toEqual(before);
      expect(fixture.fixture.input.runConfig.executionPriceProtocol.priceBasis.adjustment).toBe(
        'hfq',
      );
      expect(fixture.fixture.input.runConfig.priceResearch?.protocolVersion).toBe(
        'price-research-v1',
      );
      expect(fixture.fixture.input.runConfig.priceResearch?.actualPriceWindow).toBeUndefined();
      const execution = fixture.execute();
      expect(execution.fills.map((f) => f.side)).toEqual(['buy', 'sell']);
      expect(execution.fills[1]!.occurredAt).toContain(
        coordinate === 'research' ? '2026-05-26' : '2026-05-21',
      );
      const result = await fixture.run();
      expect(await fixture.run()).toEqual(result);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  30000,
);
