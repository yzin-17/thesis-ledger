import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// 只读导出目标运行态的真实合同，隔离验收不得伪造新版合同的已验证路由。
const root = resolve(process.argv[2] ?? '');
assert(root.startsWith(resolve('var/acceptance') + '/'));
const target = resolve(root, 'deployed-schemas');
await mkdir(target, { mode: 0o700, recursive: true });
function readArchive() {
  const { createRequire } = require('node:module');
  const { dirname } = require('node:path');
  const { execFileSync } = require('node:child_process');
  const local = createRequire('/app/apps/server/package.json');
  process.stdout.write(
    execFileSync('tar', ['-C', dirname(local.resolve('@thesis-ledger/schemas')), '-cf', '-', '.'], {
      maxBuffer: 32 * 1024 * 1024,
    }),
  );
}
const archive = execFileSync(
  'rtk',
  [
    'proxy',
    'docker',
    'exec',
    'thesis-ledger-dev-thesis-ledger-1',
    'node',
    '-e',
    `(${readArchive.toString()})()`,
  ],
  { maxBuffer: 32 * 1024 * 1024 },
);
await writeFile(resolve(root, 'deployed-schemas.tar'), archive, { mode: 0o600, flag: 'wx' });
execFileSync('tar', ['-xf', resolve(root, 'deployed-schemas.tar'), '-C', target]);
await writeFile(resolve(target, 'package.json'), JSON.stringify({ type: 'module' }), {
  mode: 0o600,
  flag: 'wx',
});
await mkdir(resolve(target, 'node_modules'), { mode: 0o700 });
await symlink(resolve('packages/schemas/node_modules/zod'), resolve(target, 'node_modules/zod'));
const deployed = await import(resolve(target, 'index.js'));
assert.equal(deployed.aiGenerationContracts.strategyDiscovery.ref.version, 'strategy-discovery-v5');
const receipt = {
  contract: deployed.aiGenerationContracts.strategyDiscovery.ref,
  archiveSha256: createHash('sha256').update(archive).digest('hex'),
  origin: 'thesis-ledger-dev-thesis-ledger-1',
  providerChanged: false,
};
await writeFile(
  resolve(root, 'deployed-schema-receipt.json'),
  JSON.stringify(receipt, null, 2) + '\n',
  { mode: 0o600, flag: 'wx' },
);
console.log(JSON.stringify(receipt));
