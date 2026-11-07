import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { publicationInput, main } from './research-economic-price-publish.mjs';
const bytes = Buffer.from(
  JSON.stringify({
    format: 'event-free-economic-price-v1',
    source: { providerId: 'hithink', upstreamSource: 'hithink-financial-api' },
    qualification: {
      documentationSha256: '6bb1e9411bdd9f5cc1989b1a1147ef38378141f9acf7ba0075057687fe36db83',
    },
  }),
);
const digest = createHash('sha256').update(bytes).digest('hex');
const args = [
  '--bundle=/tmp/a',
  `--expected-sha=${digest}`,
  '--confirm=thesis-ledger-dev/thesis_ledger',
];
test('默认只预览，输入摘要与精确开发库确认均不可省略', () => {
  assert.equal(publicationInput(args, () => bytes).apply, false);
  assert.throws(() => publicationInput(args.slice(0, 2), () => bytes));
  assert.throws(() =>
    publicationInput(
      args.map((x) => (x.startsWith('--expected-sha=') ? '--expected-sha=' + 'a'.repeat(64) : x)),
      () => bytes,
    ),
  );
  assert.throws(() => publicationInput([...args, '--unexpected=1'], () => bytes));
});
test('预览不调用Docker，目标标签不符时不能执行写入', () => {
  let calls = 0;
  const run = () => {
    calls++;
    return {
      status: 0,
      stdout: JSON.stringify({
        'com.docker.compose.project': 'another-project',
        'com.docker.compose.service': 'thesis-ledger',
      }),
    };
  };
  assert.equal(main(args, run, () => bytes).published, false);
  assert.equal(calls, 0);
  assert.throws(() => main([...args, '--apply'], run, () => bytes));
  assert.equal(calls, 1);
  assert.throws(() => publicationInput([...args, '--confirm=other'], () => bytes));
});

test('只读运行态核验传入apply=false，不能与写入混用', () => {
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    return calls.length === 1
      ? {
          status: 0,
          stdout: JSON.stringify({
            'com.docker.compose.project': 'thesis-ledger-dev',
            'com.docker.compose.service': 'thesis-ledger',
          }),
        }
      : { status: 0, stdout: JSON.stringify({ published: false, persisted: true }) };
  };
  assert.equal(main([...args, '--check-runtime'], run, () => bytes).published, false);
  assert.equal(JSON.parse(calls[1].options.input).apply, false);
  assert.throws(() => publicationInput([...args, '--apply', '--check-runtime'], () => bytes));
});
