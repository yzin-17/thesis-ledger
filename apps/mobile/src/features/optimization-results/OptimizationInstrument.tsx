import {
  optimizationExperimentInstrumentLabel,
  type OptimizationExperimentRead,
} from '@thesis-ledger/schemas';
import { Copy } from '../../components/MobilePrimitives';

export function OptimizationInstrument({ value }: { value: OptimizationExperimentRead }) {
  const label = optimizationExperimentInstrumentLabel(value);
  return label ? <Copy>{label}</Copy> : null;
}
