import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import type { AddressInfo } from 'node:net';
import { vi } from 'vitest';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import {
  MarketBarWindowReaderV3,
  type MarketBarWindowReadInputV3,
} from '../../src/market/market-bar-reader-v3.js';
import { MarketWindowEvidenceV3Repository } from '../../src/market/market-window-evidence-v3.repository.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import type { MarketControlService } from '../../src/market/market-control.service.js';
import {
  desiredProviderPolicyV3Schema,
  effectiveProviderPolicyV3Schema,
  marketRouteCatalogV3Schema,
  marketDataBarSeriesRequestV3Schema,
  backtestInstrumentFactsRequestSchema,
} from '@thesis-ledger/schemas';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { makeMultiWindowResponseV3 } from './v3-multi-window-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';

/** 受控网络只提供已登记响应；准入/路由修订仍由明确 fixture 提供。 */
export async function startWorkerDsaHttpFixture(
  databaseUrl: string,
  redisUrl: string,
  prisma: PrismaService,
) {
  const fixture = await completeSnapshotFixture();
  const load = async (name: string) =>
    JSON.parse(
      await readFile(
        new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url),
        'utf8',
      ),
    ) as unknown;
  const desired = desiredProviderPolicyV3Schema.parse(await load('market-route-v3.etf-qfq.json'));
  desired.revision = 7;
  const effective = effectiveProviderPolicyV3Schema.parse(
    await load('market-control-v3.effective.etf-qfq.json'),
  );
  effective.sourceDesiredRevision = 7;
  const catalog = marketRouteCatalogV3Schema.parse(
    await load('market-route-catalog-v3.complete.json'),
  );
  catalog.catalogRevision = 12;
  const paths: string[] = [];
  let multiWindowEnabled = false;
  let missingTradingDates: readonly string[] = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://fixture');
    response.setHeader('content-type', 'application/json');
    const control = url.pathname.includes('/control/');
    if (
      request.headers.authorization !==
      `Bearer ${control ? 'isolated-control-fixture' : 'isolated-dsa-fixture'}`
    ) {
      response.writeHead(401).end('{}');
      return;
    }
    paths.push(url.pathname);
    try {
      let payload: unknown;
      const query = Object.fromEntries(url.searchParams);
      if (url.pathname === '/api/v3/thesis-ledger/backtest/calendar') {
        payload = await fixture.dsa.backtestCalendar(
          query as Parameters<DsaClient['backtestCalendar']>[0],
        );
      } else if (url.pathname === '/api/v3/thesis-ledger/backtest/instrument-facts') {
        payload = await fixture.dsa.backtestInstrumentFacts(
          backtestInstrumentFactsRequestSchema.parse({
            ...query,
            ...(query.barRouteIndex === undefined
              ? {}
              : { barRouteIndex: Number(query.barRouteIndex) }),
            ...(query.identityOnly === undefined
              ? {}
              : { identityOnly: query.identityOnly === 'true' }),
          }),
        );
      } else if (url.pathname === '/api/v3/thesis-ledger/market/bars') {
        let body = '';
        for await (const chunk of request) body += String(chunk);
        const parsed = marketDataBarSeriesRequestV3Schema.parse(JSON.parse(body));
        const planned = await makeReaderResult(
          {
            market: parsed.routeKey.market,
            symbol: parsed.symbol,
            routeKey: parsed.routeKey,
            window: { start: parsed.start, end: parsed.end },
            ...(parsed.tradabilityMode ? { tradabilityMode: parsed.tradabilityMode } : {}),
          },
          false,
          missingTradingDates,
        );
        if (planned.status !== 'selected') throw new Error('不支持的样本');
        const single = { ...planned.selection.response, requestId: parsed.requestId };
        payload = multiWindowEnabled ? makeMultiWindowResponseV3(single) : single;
      } else if (url.pathname === '/api/v3/thesis-ledger/capabilities') {
        payload = {
          dataContractVersions: [3],
          serviceCapabilities: { fundNav: true },
          multiWindowProtocols: ['market-multi-window-content-v1'],
        };
      } else if (url.pathname === '/api/v3/thesis-ledger/control/policies/effective') {
        payload = { contractVersion: 3, consumer: 'thesis-ledger', projection: { effective } };
      } else if (url.pathname === '/api/v3/thesis-ledger/control/routes/capabilities') {
        payload = catalog;
      } else {
        response.writeHead(404).end('{}');
        return;
      }
      response.end(JSON.stringify(payload));
    } catch {
      response.writeHead(400).end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  vi.stubEnv('DATABASE_URL', databaseUrl);
  vi.stubEnv('REDIS_URL', redisUrl);
  vi.stubEnv('DSA_BASE_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  vi.stubEnv('THESIS_LEDGER_DSA_TOKEN', 'isolated-dsa-fixture');
  vi.stubEnv('THESIS_LEDGER_CONTROL_TOKEN', 'isolated-control-fixture');
  vi.stubEnv('CREDENTIAL_ENCRYPTION_KEY', 'isolated-dsa-fixture-key');
  const dsa = new DsaClient();
  const repository = new MarketWindowEvidenceV3Repository(prisma);
  const record = repository.record.bind(repository);
  repository.record = async (input) => {
    try {
      return await record({ ...input, fetchedAt: new Date('2026-05-20T07:02:00.000Z') });
    } catch (error) {
      const rows = await prisma.marketBarWindowEvidenceV3.findMany();
      console.error(
        '证据比较诊断',
        rows.map((row) => ({
          priceBasisEqual: isDeepStrictEqual(row.sourcePriceBasis, input.response.sourcePriceBasis),
          coverageEqual: isDeepStrictEqual(row.coverageProof, input.response.coverageProof),
          storedHashValid:
            marketFrozenWindowHashV3(row.completeResponse) === row.completeResponseHash,
          incomingHashEqual: marketFrozenWindowHashV3(input.response) === row.completeResponseHash,
        })),
      );
      throw error;
    }
  };
  const windowReader = new MarketBarWindowReaderV3(
    {
      getPolicy: async () => ({
        ...desired,
        syncState: 'applied',
        effectiveStale: false,
      }),
    } as unknown as MarketControlService,
    dsa,
    repository,
  );
  const reader = {
    read: vi.fn(),
    readV3: vi.fn(async (input: MarketBarWindowReadInputV3) => {
      return windowReader.read(input);
    }),
  };
  return {
    fixture,
    dsa,
    reader,
    paths,
    enableMultiWindow: () => {
      multiWindowEnabled = true;
    },
    setMissingTradingDates: (dates: readonly string[]) => {
      missingTradingDates = dates;
      multiWindowEnabled = false;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
