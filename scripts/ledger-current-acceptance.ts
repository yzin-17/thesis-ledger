import { writeFile } from 'node:fs/promises';
import {
  ledgerHttp,
  runCurrentLedgerHttpProbe,
  runOldLedgerHttpProbe,
} from '../apps/server/test/ledger/current-envelope-http-probe.js';

async function main() {
  const origin = process.env.LEDGER_ACCEPTANCE_ORIGIN ?? 'http://127.0.0.1:3000';
  const accountId = process.env.LEDGER_ACCEPTANCE_ACCOUNT_ID;
  const oldAccountId = process.env.LEDGER_ACCEPTANCE_OLD_ACCOUNT_ID;
  const oldEventId = process.env.LEDGER_ACCEPTANCE_OLD_EVENT_ID;
  const output = process.env.LEDGER_ACCEPTANCE_OUTPUT ?? '/private/tmp/e03-d-target-http.json';
  const symbol = process.env.LEDGER_ACCEPTANCE_SYMBOL ?? '600519.SH';
  const url = new URL(origin);
  if (
    url.hostname !== '127.0.0.1' ||
    url.protocol !== 'http:' ||
    process.env.LEDGER_ACCEPTANCE_CONFIRM !== 'e03-d-dedicated-accounts'
  )
    throw new Error('仅允许本机开发目标，必须显式确认 E03 专用验收账户');
  if (!accountId || !oldAccountId || !oldEventId || accountId === oldAccountId)
    throw new Error('必须提供独立空账户、独立旧记录账户及其事件身份');
  const request = ledgerHttp(origin, process.env.THESIS_LEDGER_API_TOKEN);
  // 先验证旧行拒绝；目标代码未更新时不写入新命令。
  const old = await runOldLedgerHttpProbe(request, oldAccountId, oldEventId, symbol);
  const current = await runCurrentLedgerHttpProbe(request, accountId, symbol);
  await writeFile(
    output,
    JSON.stringify({ checkedAt: new Date().toISOString(), origin, current, old }, null, 2),
  );
  console.log(
    JSON.stringify({
      accountId,
      oldAccountId,
      ledgerRevision: current.current.ledgerRevision,
      events: current.audit.events.length,
      rejectedOldRequests: old.results.length,
      output,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '账本验收失败');
  process.exitCode = 1;
});
