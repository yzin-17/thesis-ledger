import { readFile } from 'node:fs/promises';
import {
  evaluateProjectionSwitch,
  parseProjectionReadMode,
  projectionSwitchStages,
} from '../packages/domain/dist/index.js';

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const reportPath = argument('--report');
const targetMode = parseProjectionReadMode(argument('--mode') ?? process.env.PROJECTION_READ_MODE);
if (!reportPath) throw new Error('必须提供 --report <projection-diff-report.json>');

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const stages = (argument('--stages') ?? '')
  .split(',')
  .map((stage) => stage.trim())
  .filter((stage) => projectionSwitchStages.includes(stage));
const decision = evaluateProjectionSwitch({
  targetMode,
  completedStages: stages,
  report,
  rollbackCheckpointAvailable: process.argv.includes('--rollback-checkpoint'),
  sourceLedgerMutated: process.argv.includes('--source-ledger-mutated'),
});
process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
if (!decision.allowed) process.exitCode = 2;
