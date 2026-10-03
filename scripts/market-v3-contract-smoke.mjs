import { probeMarketV3Contract } from './market-v3-contract-probe.mjs';

try {
  const result = await probeMarketV3Contract({
    origin: process.env.CONTRACT_DSA_ORIGIN,
    controlToken: process.env.THESIS_LEDGER_CONTROL_TOKEN,
    dataToken: process.env.THESIS_LEDGER_DSA_TOKEN,
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
