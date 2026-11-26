import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** 在真实HTTP发送前落盘占用额度；同一用途探针或业务样本不能发第二次。 */
export function practicalV6Budget(
  directory: string,
  enabled: boolean,
  maximum = 10,
  authorization = '2026-11-21-user-approved-v6-10',
) {
  assert(Number.isSafeInteger(maximum) && maximum >= 1 && maximum <= 10, '调用上限必须为1～10');
  const forward = globalThis.fetch;
  const ledger: { key: string; state: string; at: string; status?: number }[] = [];
  let current = '',
    unknown = false;
  writeFileSync(resolve(directory, 'call-ledger.json'), '{}', { mode: 0o600, flag: 'wx' });
  const persist = () =>
    writeFileSync(
      resolve(directory, 'call-ledger.json'),
      JSON.stringify(
        {
          authorization,
          maximum,
          sent: ledger.length,
          probes: ledger.filter((item) => item.key.endsWith('/probe')).length,
          business: ledger.filter((item) => !item.key.endsWith('/probe')).length,
          unknown,
          ledger,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  persist();
  globalThis.fetch = async (url, init) => {
    assert(enabled, '离线预检禁止真实请求');
    assert(!unknown && current && ledger.length < maximum, '预算或传输状态不允许发送');
    assert(!ledger.some((item) => item.key === current), '禁止自动重试或重复发送');
    const target = new URL(String(url));
    assert.equal(target.hostname, '192.168.5.20');
    assert.equal(init?.method?.toUpperCase(), 'POST');
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m');
    assert.equal(body.response_format?.type, 'json_schema');
    const row = {
      key: current,
      state: 'reserved-before-send',
      at: new Date().toISOString(),
      status: 0,
    };
    ledger.push(row);
    persist();
    try {
      const response = await forward(url, init);
      row.status = response.status;
      row.state = 'headers-received';
      persist();
      return response;
    } catch (error) {
      row.state = 'transport-unknown';
      unknown = true;
      persist();
      throw error;
    }
  };
  return {
    begin(key: string) {
      assert(!unknown);
      current = key;
    },
    complete() {
      const row = ledger.find((item) => item.key === current);
      if (row) {
        row.state = 'response-complete';
        persist();
      }
    },
    unknown() {
      unknown = true;
      persist();
    },
    get sent() {
      return ledger.length;
    },
    restore() {
      globalThis.fetch = forward;
    },
  };
}
