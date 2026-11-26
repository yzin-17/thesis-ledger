import { aiGenerationContracts } from '@thesis-ledger/schemas';
import type { ExperimentRow } from './strategy-optimization-common.js';

export const optimizationGenerationContract = (experiment: Pick<ExperimentRow, 'sourceMode'>) =>
  experiment.sourceMode === 'discovery'
    ? aiGenerationContracts.strategyDiscovery
    : aiGenerationContracts.parameterOptimization;
