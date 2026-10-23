import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { createServer } from 'node:http';

export function controlledModel(generation) {
  let mode = 'valid';
  const requests = [], waiters = [], held = new Set();
  const write = response => {
    const common = { id: 'controlled-recovery-v2', object: 'chat.completion.chunk', created: 1, model: 'controlled-model' };
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const value of [
      { choices: [{ index: 0, delta: { content: JSON.stringify(generation) }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13, cost: 0.07 } },
    ]) response.write(`data: ${JSON.stringify({ ...common, ...value })}\n\n`);
    response.end('data: [DONE]\n\n');
  };
  const server = createServer((request, response) => {
    void (async () => {
      assert.equal(request.method, 'POST'); assert.equal(request.url, '/v1/chat/completions');
      const body = []; for await (const chunk of request) body.push(Buffer.from(chunk));
      const payload = JSON.parse(Buffer.concat(body).toString());
      assert.equal(payload.model, 'controlled-model');
      requests.push(payload);
      while (waiters.length) waiters.shift()();
      if (mode === 'hold') held.add(response); else write(response);
    })().catch(() => response.destroy());
  });
  return {
    requests,
    async start() {
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${server.address().port}`;
    },
    hold() { mode = 'hold'; },
    valid() { mode = 'valid'; },
    async received(count) {
      const deadline = Date.now() + 20_000;
      while (requests.length < count) {
        assert(Date.now() < deadline, '受控模型没有收到预期 SDK 请求');
        await Promise.race([new Promise(resolve => waiters.push(resolve)), setTimeout(100)]);
      }
    },
    release() { for (const response of held) { if (!response.destroyed) write(response); } held.clear(); },
    async close() {
      for (const response of held) response.destroy();
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    },
  };
}

export function workerPool(file, origin) {
  const children = new Set(), exits = [];
  function launch(phase, runId) {
    const child = spawn(process.execPath, [file, phase, runId, origin],
      { env: process.env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    children.add(child);
    let output = '', prepared, error;
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
    const ready = new Promise(resolve => {
      child.on('message', message => { if (message.ready) { prepared = message; resolve(message); } });
    });
    const exited = new Promise(resolve => {
      child.once('error', value => { error = value; resolve({ code: -1, signal: null }); });
      child.once('exit', (code, signal) => { children.delete(child); exits.push({ phase, code, signal }); resolve({ code, signal }); });
    });
    return { child, ready: async () => {
      await Promise.race([ready, exited, setTimeout(20_000, undefined, { ref: false })]);
      assert(prepared, `独立进程未到达 ${phase} 边界：${error?.message ?? output.slice(-300)}`);
      return prepared;
    }, done: async () => {
      const result = await Promise.race([exited, setTimeout(25_000, null, { ref: false })]);
      assert(result, `独立进程 ${phase} 未收敛`);
      assert.equal(result.code, 0, `独立进程 ${phase} 失败：${output.slice(-700)}`);
    }, kill: async () => {
      assert(child.kill('SIGKILL'), '受控独立进程无法结束');
      const result = await exited; assert.equal(result.signal, 'SIGKILL');
    } };
  }
  return { launch, exits,
    async run(phase, id) { await launch(phase, id).done(); },
    async close() {
      for (const child of children) child.kill('SIGKILL');
      for (let attempt = 0; children.size && attempt < 100; attempt += 1) await setTimeout(10);
      assert.equal(children.size, 0, '存在未清理的受控子进程');
    },
  };
}
