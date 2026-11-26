import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { browserRegressions } from './cases.mjs';
import { createDesktopHost, root } from './runtime.mjs';

const { values } = parseArgs({ options: {
  list: { type: 'boolean' }, group: { type: 'string' }, case: { type: 'string' }, output: { type: 'string' },
} });
const cases = browserRegressions.filter((item) =>
  (!values.group || item.group === values.group) && (!values.case || item.id === values.case));
if (!cases.length) throw new Error('没有匹配的界面回归');
if (values.list) {
  console.log(JSON.stringify(cases, null, 2));
} else {
  const output = values.output ? resolve(values.output) : await mkdtemp(join(tmpdir(), 'thesis-ui-regressions-'));
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length) throw new Error('回归输出目录必须为空，避免覆盖已有证据');
  process.env.VITEST = 'true';
  const { server, origin } = await createDesktopHost(join(output, 'vite-cache'));
  const results = [];
  let child;
  let interrupted = false;
  const stop = () => { interrupted = true; child?.kill('SIGTERM'); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    for (const item of cases) {
      if (interrupted) break;
      const directory = join(output, item.id);
      await mkdir(directory);
      const log = createWriteStream(join(directory, 'run.log'));
      const env = { ...process.env,
        ARENA_MOBILE_QA_ORIGIN: origin, MULTISELECT_DESKTOP_ORIGIN: origin, MULTISELECT_MOBILE_ORIGIN: origin,
        PROVIDER_HEALTH_QA_ORIGIN: origin, RISK_RULE_QA_ORIGIN: origin,
        ARENA_QA_OUTPUT: directory, MULTISELECT_QA_OUTPUT: directory, PROVIDER_HEALTH_QA_OUTPUT: directory,
        RISK_MOBILE_QA_OUTPUT: directory, RISK_RULE_QA_OUTPUT: directory, STRATEGY_MONITORING_QA_OUTPUT: directory,
      };
      for (const key of ['MULTISELECT_QA_TARGET', 'RISK_RULE_QA_WIDTH', 'RISK_RULE_QA_MODE']) delete env[key];
      const code = await new Promise((done) => {
        child = spawn(process.execPath, [fileURLToPath(new URL(item.file, import.meta.url))], {
          cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000,
        });
        child.stdout.pipe(log, { end: false });
        child.stderr.pipe(log, { end: false });
        child.once('error', (error) => log.write(`${error.message}\n`));
        child.once('close', (status) => log.end(() => done(status ?? 1)));
      });
      child = undefined;
      results.push({ id: item.id, group: item.group, status: code === 0 ? '通过' : '失败', code });
      console.log(`${item.id}：${code === 0 ? '通过' : '失败'}；日志 ${join(directory, 'run.log')}`);
    }
  } finally {
    child?.kill('SIGTERM');
    await server.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await writeFile(join(output, 'report.json'), JSON.stringify({ output, interrupted, results }, null, 2));
  }
  if (interrupted || results.some((result) => result.code !== 0)) process.exitCode = 1;
}
