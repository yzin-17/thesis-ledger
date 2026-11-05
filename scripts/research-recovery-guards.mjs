import assert from 'node:assert/strict';

export function recoveryDatabaseUrl(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'postgresql:'); assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '5432'); assert.equal(url.pathname, '/restore_db');
  assert.equal(url.username, 'restore_owner'); assert.equal(url.password, '');
  assert.equal(url.search, ''); assert.equal(url.hash, '');
  return url;
}

export function controlledOrigin(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, '127.0.0.1');
  assert(Number(url.port) >= 1024); assert.equal(url.username, ''); assert.equal(url.password, '');
  assert.equal(url.pathname, '/'); assert.equal(url.search, ''); assert.equal(url.hash, '');
  return url.origin;
}
