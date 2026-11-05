import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = 'thesis-ledger-dev-thesis-ledger-1';
export const targetFaultLimits = { guard: 0, headers: 1, heartbeat: 1, idle: 1, deadline: 2 };
const files = [
  'ai-provider-target-fault-runtime.mjs',
  'ai-provider-target-fault-relay.mjs',
  'ai-provider-target-fault-requests.mjs',
];

export function targetFaultOptions(args) {
  const options = { execute: false, case: 'guard' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--execute') options.execute = true;
    else if (['--case', '--output', '--authorization'].includes(args[i])) {
      assert(args[i + 1] && !args[i + 1].startsWith('--'), '参数缺少值');
      options[args[i].slice(2)] = args[++i];
    } else throw new Error('只允许case/output/authorization及execute参数');
  }
  assert(Object.hasOwn(targetFaultLimits, options.case), '场景不在本批范围');
  if (options.execute) {
    assert(options.authorization && options.output, '执行必须提供授权及独立输出');
    const scope = JSON.parse(readFileSync(resolve(options.authorization), 'utf8'));
    assert.equal(scope.authorized, true);
    assert.equal(scope.provider, 'cloudflare');
    assert.equal(scope.model, '@cf/qwen/qwen3.8-27b');
    assert.equal(scope.feeCeiling, '0 USD');
    assert.equal(scope.maxModelCalls, 5);
    assert(resolve(scope.artifactDir).startsWith(resolve(root, '.recovery-artifacts') + sep));
    assert.equal(resolve(options.output), join(resolve(scope.artifactDir), options.case));
    assert(!existsSync(resolve(options.output)), '已有场景证据，不重放');
  }
  return options;
}

export async function runTargetFaultAcceptance(options) {
  if (!options.execute)
    return {
      mode: 'plan',
      scenario: options.case,
      realModelCallLimit: targetFaultLimits[options.case],
      feeCeiling: '0 USD',
      dockerMutations: 0,
      credentialReads: 0,
      externalCalls: 0,
    };
  const output = resolve(options.output);
  const scope = JSON.parse(readFileSync(resolve(options.authorization), 'utf8'));
  if (options.case !== 'guard') {
    const order = Object.keys(targetFaultLimits);
    const prior = join(scope.artifactDir, order[order.indexOf(options.case) - 1], 'receipt.json');
    const result = JSON.parse(readFileSync(prior, 'utf8'));
    assert.equal(result.completed, true, '前一独立验收未通过，不派发后续实源');
  }
  mkdirSync(output, { mode: 0o700 });
  const save = (name, value) =>
    writeFileSync(join(output, name), JSON.stringify(value, null, 2), { mode: 0o600 });
  const run = (args, input, timeout = 30000) => {
    const result = spawnSync('docker', args, {
      input,
      encoding: 'utf8',
      timeout,
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(result.status, 0, `维护命令失败：docker ${args[0]}，${result.status}`);
    return result.stdout.trim();
  };
  const target = JSON.parse(
    run([
      'inspect',
      '--format',
      '{"id":"{{.Id}}","image":"{{.Image}}","running":{{.State.Running}},"labels":{{json .Config.Labels}}}',
      server,
    ]),
  );
  assert.equal(target.running, true);
  assert.equal(target.labels['com.docker.compose.project'], 'thesis-ledger-dev');
  assert.equal(target.labels['com.docker.compose.service'], 'thesis-ledger');
  assert.equal(target.id, scope.targetId);
  assert.equal(target.image, scope.targetImage);
  const directory = `/tmp/thesis-ledger-ai-provider-fault-${randomBytes(4).toString('hex')}`;
  const sources = Object.fromEntries(
    files.map((name) => [name, readFileSync(join(root, 'scripts', name), 'utf8')]),
  );
  const receipt = {
    startedAt: new Date().toISOString(),
    scenario: options.case,
    target: { id: target.id, image: target.image },
    directory,
    realModelCallLimit: targetFaultLimits[options.case],
    sourceHashes: Object.fromEntries(
      Object.entries(sources).map(([n, s]) => [n, createHash('sha256').update(s).digest('hex')]),
    ),
    completed: false,
    exported: false,
    cleaned: false,
  };
  save('receipt.json', receipt);
  const bootstrap = `import{mkdirSync,writeFileSync}from'node:fs';import{pathToFileURL}from'node:url';
    const directory=${JSON.stringify(directory)};mkdirSync(directory,{mode:0o700});
    for(const[name,source]of Object.entries(${JSON.stringify(sources)}))writeFileSync(directory+'/'+name,source,{mode:0o600});
    try{const{runTargetFaultRuntime}=await import(pathToFileURL(directory+'/ai-provider-target-fault-runtime.mjs'));
    await runTargetFaultRuntime(${JSON.stringify({ case: options.case, scope })},directory)}catch(error){process.stderr.write('所属验收失败：'+error.name+'\\n');process.exitCode=1}`;
  try {
    const child = spawnSync('docker', ['exec', '-i', server, 'node', '--input-type=module'], {
      input: bootstrap,
      encoding: 'utf8',
      timeout: 750000,
      maxBuffer: 4 * 1024 * 1024,
    });
    writeFileSync(join(output, 'runtime.log'), child.stdout ?? '', { mode: 0o600 });
    writeFileSync(join(output, 'runtime-error.log'), child.stderr ?? '', { mode: 0o600 });
    receipt.runtimeExitCode = child.status;
    const proof = JSON.parse(run(['exec', server, 'cat', `${directory}/proof.json`]));
    save('proof.json', proof);
    receipt.exported = true;
    receipt.productionModulesMatchHost = Object.entries(proof.productionModules).every(
      ([name, hash]) =>
        createHash('sha256')
          .update(readFileSync(join(root, 'apps/server/dist/src', `${name}.js`)))
          .digest('hex') === hash,
    );
    receipt.realModelCalls = proof.realModelCalls;
    assert.equal(child.status, 0, '目标样本失败，保留已导出事实');
    assert.equal(proof.status, 'passed');
    assert.equal(receipt.productionModulesMatchHost, true, '目标产物不匹配');
    receipt.completed = true;
  } finally {
    if (receipt.exported) {
      assert.match(directory, /^\/tmp\/thesis-ledger-ai-provider-fault-[a-f0-9]{8}$/);
      run([
        'exec',
        server,
        'node',
        '-e',
        `require('node:fs').rmSync(${JSON.stringify(directory)},{recursive:true,force:true})`,
      ]);
      receipt.cleaned = true;
    }
    receipt.finishedAt = new Date().toISOString();
    save('receipt.json', receipt);
  }
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(
      JSON.stringify(await runTargetFaultAcceptance(targetFaultOptions(process.argv.slice(2)))) +
        '\n',
    );
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}
