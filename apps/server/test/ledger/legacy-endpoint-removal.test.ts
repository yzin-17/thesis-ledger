import { describe, expect, it } from 'vitest';
import { LedgerController } from '../../src/ledger/ledger.controller.js';
import { LedgerService } from '../../src/ledger/ledger.service.js';

describe('Ledger V2 public write surface', () => {
  it('不再暴露旧通用 events 写入口和 append 命令', () => {
    expect('append' in LedgerController.prototype).toBe(false);
    expect('append' in LedgerService.prototype).toBe(false);
    expect('createExecution' in LedgerController.prototype).toBe(true);
  });
});
