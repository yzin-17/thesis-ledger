import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

const url = process.env.JOURNAL_REVIEW_DATABASE_URL;
describe.skipIf(!url)('自选 HTTP 与 PostgreSQL', () => {
  let host: ChildProcess | undefined;
  let origin: string;
  let db: PrismaClient;
  async function start() {
    const child = fork(resolve('test/watchlist/fixture-host.mjs'), [], {
      execArgv: [],
      env: { ...process.env, STRATEGY_IDENTITY_MODE: 'account' },
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
    host = child;
    origin = await new Promise<string>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error('测试服务提前退出 ' + code)));
      child.once('message', (value) => resolve(String(value)));
    });
  }
  async function stop() {
    if (!host?.connected) return;
    const exited = once(host, 'exit');
    host.disconnect();
    await exited;
    host = undefined;
  }
  async function request(path: string, token: string, body?: object) {
    return fetch(origin + '/api/v1/watchlist' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-thesis-ledger-session': token, 'content-type': 'application/json' },
      ...(body && { body: JSON.stringify(body) }),
    });
  }
  async function protectedData() {
    return Promise.all([
      db.account.findMany(),
      db.asset.findMany(),
      db.instrumentAssetAssociation.findMany(),
      db.position.findMany(),
      db.ledgerEvent.findMany(),
      db.trade.findMany(),
      db.accountLedgerState.findMany(),
      db.journalReviewSnapshot.findMany(),
    ]).then((rows) => JSON.stringify(rows));
  }
  afterAll(async () => {
    await stop();
    await db?.$disconnect();
  });
  it('身份隔离、重复添加、重启与删除，经真实 HTTP 保留既有数据', async () => {
    const target = new URL(url!);
    if (target.hostname !== '127.0.0.1' || target.pathname !== '/journal_review_fixture')
      throw new Error('需要隔离数据库');
    target.username = 'fixture_app';
    db = new PrismaClient({ datasourceUrl: target.href });
    await start();
    const user = async (name: string) => {
      const response = await fetch(origin + '/api/v1/identity/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: name, password: randomUUID(), displayName: name }),
      });
      expect(response.status).toBe(201);
      return (await response.json()).token as string;
    };
    const [alice, bob] = await Promise.all([user('watchlist.a'), user('watchlist.b')]);
    const asset = await db.instrument.create({
      data: {
        canonicalCode: '001234',
        market: 'SZ',
        instrumentType: 'STOCK',
        displayName: '目录名称',
        generation: 1,
      },
    });
    await db.asset.create({
      data: {
        symbol: '001234.SZ',
        name: '旧名称',
        market: 'SZ',
        assetType: 'stock',
        currency: 'CNY',
      },
    });
    const snapshot = await protectedData();
    expect(
      (await request('/items', alice, { instrumentId: asset.id, ownerId: randomUUID() })).status,
    ).toBe(400);
    expect((await request('/items', alice, { instrumentId: asset.id })).status).toBe(201);
    expect(await (await request('/items', alice, { instrumentId: asset.id })).json()).toEqual({
      revision: 1,
    });
    await stop();
    await start();
    const page = await (await request('', alice)).json();
    expect(page.items).toHaveLength(1);
    expect(page.items[0].displayName).toBe('目录名称');
    expect((await (await request('', bob)).json()).items).toEqual([]);
    expect(
      (await request('/changes', bob, { action: 'remove', itemId: page.items[0].id, revision: 0 }))
        .status,
    ).toBe(404);
    expect(
      (
        await request('/changes', alice, {
          action: 'remove',
          itemId: page.items[0].id,
          revision: 0,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request('/changes', alice, {
          action: 'remove',
          itemId: page.items[0].id,
          revision: 1,
        })
      ).status,
    ).toBe(201);
    await stop();
    await start();
    expect((await (await request('', alice)).json()).items).toEqual([]);
    expect(await protectedData()).toBe(snapshot);
  }, 30000);
});
