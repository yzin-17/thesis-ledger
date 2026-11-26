import { createInterface } from 'node:readline';
import {
  previewResearchConversion,
  type ResearchMigrationCall,
  type ResearchMigrationRun,
} from './named-v1-research-conversion.js';

const counts = { convert: 0, unproven: 0 };
const runs = [];
for await (const input of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const { run, calls } = JSON.parse(input) as {
    run: ResearchMigrationRun; calls: ResearchMigrationCall[];
  };
  const result = previewResearchConversion(run, calls);
  counts[result.outcome] += 1;
  runs.push({
    id: run.id,
    status: run.status,
    outcome: result.outcome,
    ...('reason' in result ? { reason: result.reason } : {}),
  });
}
process.stdout.write(JSON.stringify({
  contract: 'research-report-migration-preview-v1', counts, runs,
}) + '\n');
