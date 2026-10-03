import { readFile } from 'node:fs/promises';
import { probeMarketV3Business } from './market-v3-business-probe.mjs';

try {
  const fixture = await readFile(
    new URL(
      '../packages/schemas/fixtures/market-data-v3.request.etf-qfq-target-pinned.json',
      import.meta.url,
    ),
    'utf8',
  );
  const result = await probeMarketV3Business({
    origin: process.env.CONTRACT_DSA_ORIGIN,
    dataToken: process.env.THESIS_LEDGER_DSA_TOKEN,
    barRequest: JSON.parse(fixture),
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
