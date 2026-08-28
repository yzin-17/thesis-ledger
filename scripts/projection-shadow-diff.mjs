import { readFile, writeFile } from 'node:fs/promises';
import { compareProjectionSnapshots } from '../packages/domain/dist/index.js';

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const inputPath = argument('--input') ?? process.env.PROJECTION_DIFF_INPUT;
const outputPath = argument('--output');
if (!inputPath) {
  throw new Error('必须提供 --input <legacy-unified.json>；脚本只读取比较输入，不修改 Ledger');
}

const input = JSON.parse(await readFile(inputPath, 'utf8'));
if (!input || typeof input !== 'object' || !input.legacy || !input.unified)
  throw new Error('差异输入必须包含 legacy 和 unified 两个快照');

const report = compareProjectionSnapshots(input.legacy, input.unified, {
  ...(typeof input.generatedAt === 'string' ? { generatedAt: input.generatedAt } : {}),
});
const output = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) await writeFile(outputPath, output, 'utf8');
else process.stdout.write(output);
if (report.gate.status !== 'PASS') process.exitCode = 2;
