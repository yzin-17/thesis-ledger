import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateResearchTraceInputV1 } from '../apps/server/dist/src/ai/ai-research-trace-evaluation.js';

const [input, ...extra] = process.argv.slice(2);
if (!input || extra.length > 0)
  throw new Error('用法：node scripts/evaluate-research-trace.mjs <脱敏轨迹 JSON>');
const path = resolve(input);
if (statSync(path).size > 10 * 1024 * 1024) throw new Error('离线轨迹输入不得超过 10 MiB');
const report = evaluateResearchTraceInputV1(readFileSync(path, 'utf8'));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
