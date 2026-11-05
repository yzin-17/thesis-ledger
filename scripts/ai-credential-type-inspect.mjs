import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

let inputText = '';
for await (const chunk of process.stdin) inputText += chunk;
const input = JSON.parse(inputText);
assert.match(input.id, /^[a-f0-9-]{36}$/);
const require = createRequire('/app/apps/server/package.json');
const { PrismaClient } = require('@prisma/client');
const { credentialKeyRingFromEnv, decryptProviderCredential } =
  await import('/app/apps/server/dist/src/platform/credential-security.js');
const prisma = new PrismaClient();
try {
  const result = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const identity = await transaction.$queryRaw`
      SELECT current_database()::text AS database, current_user::text AS role`;
    assert.deepEqual(identity, [{ database: 'thesis_ledger', role: 'thesis_ledger_app' }]);
    const row = await transaction.providerConfig.findUniqueOrThrow({ where: { id: input.id } });
    assert.equal(row.name, 'controlled-type-contract-20261021');
    assert(['ai', 'market'].includes(row.type));
    assert.equal(row.enabled, false);
    if (row.type === 'ai') assert.equal(row.settings.baseUrl, 'http://127.0.0.1:9/v1');
    else assert.deepEqual(row.settings, {});
    assert(
      !Object.hasOwn(row.settings, 'apiKey') && !Object.hasOwn(row.settings, 'credentialsRef'),
    );
    const { encryptedCredentials, updatedAt, ...publicRow } = row;
    const digest = (value) => createHash('sha256').update(value).digest('hex');
    const credential = encryptedCredentials
      ? decryptProviderCredential(encryptedCredentials, credentialKeyRingFromEnv()).credential
      : null;
    return {
      ...publicRow,
      revision: updatedAt.toISOString(),
      credentialCipherHash: encryptedCredentials ? digest(encryptedCredentials) : null,
      credentialPlainHash: credential === null ? null : digest(credential),
    };
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await prisma.$disconnect();
}
