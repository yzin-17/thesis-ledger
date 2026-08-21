import type { QuantCapabilityContract } from './index.js';

export type DsaCapabilitySnapshot = {
  provider: string;
  contractVersion: number;
  capabilities: string[];
};

export async function getDsaCapabilitySnapshot(
  contract: QuantCapabilityContract,
): Promise<DsaCapabilitySnapshot> {
  const declaration = await contract.capabilities();

  return {
    provider: declaration.provider,
    contractVersion: declaration.contractVersion,
    capabilities: [
      declaration.capabilities.quote ? 'quote' : '',
      ...declaration.capabilities.bars.timeframes.map((item) => `bars-${item}`),
      ...declaration.capabilities.indicators.names.map((item) => `indicator-${item}`),
      declaration.capabilities.chip.summary ? 'chip-summary' : '',
    ].filter(Boolean),
  };
}
