import { createInterface } from 'node:readline';
import {
  convertAuthoringOperation,
  convertAuthoringRevision,
  convertSubmittedBacktest,
} from './named-v1-strategy-workflow-conversion.js';

const conversions = {
  submission: convertSubmittedBacktest,
  revision: convertAuthoringRevision,
  operation: convertAuthoringOperation,
};
const entries = [];
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const { kind, key, row } = JSON.parse(line) as {
    kind: keyof typeof conversions;
    key: string;
    row: Record<string, unknown>;
  };
  const result = conversions[kind](row);
  entries.push({ kind, key, outcome: result.outcome,
    ...('reason' in result ? { reason: result.reason } : {}) });
}
process.stdout.write(JSON.stringify({ contract: 'strategy-workflow-migration-preview-v1', entries }) + '\n');
