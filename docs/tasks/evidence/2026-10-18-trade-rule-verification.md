# 2026-10-18 成交规则验证状态更正验收

## 范围

完成 T18.C1 的 Desktop 叶：当前手工表单只有通用数量与价格校验，因此更正成交时必须按本次命令记录 `UNVERIFIED`，不能继承被替代事件的 `VERIFIED`。产品要求见 [交易产品体验 Spec](../../specs/2026-08-26-trade-product-experience.md)“成交录入”；任务条件见 [交易与成交记录剩余任务](../2026-08-26-trade-execution-ledger-system-follow-up.md) T18.C1。

## 实现与回归

- `apps/desktop/src/features/account-data/account-data.helpers.ts`：`executionDraft` 无论新建或从旧成交建立更正草稿，都将 `capabilityVerification` 初始化为 `UNVERIFIED`。其它成交字段继续从旧事件填充；不修改旧事件对象。
- `apps/desktop/test/account-data-write-recovery.ui.test.tsx`：真实挂载 `ExecutionFormSheet`，以旧 `VERIFIED` BUY 成交打开更正表单，输入新数量、价格和原因，并令 mock 写入失败。断言替换请求发送 `UNVERIFIED`，输入保留，原事件仍为 `VERIFIED`。另通过 mock 目录结果完成新建成交提交流程，断言创建请求的 payload 为 `UNVERIFIED`。

## 验证

工作目录 `apps/desktop`：

- 红灯：临时恢复原 helper 行为后运行 `rtk pnpm exec vitest run test/account-data-write-recovery.ui.test.tsx`。10 项中 1 项失败、9 项通过；更正请求携带旧 `VERIFIED`，与本次命令应为 `UNVERIFIED` 的断言冲突。
- 绿灯：恢复 helper 修复后运行同一命令，测试文件 10 项全部通过。
- 工作目录仓库根：`rtk pnpm exec eslint apps/desktop/src/features/account-data/account-data.helpers.ts apps/desktop/test/account-data-write-recovery.ui.test.tsx` 通过。

验证范围是 Desktop 表单与 mock API 命令边界，不包含真实 Server/DSA/Provider 运行时或交易规则来源验真。未改变 LedgerEvent、Schema、Server、账户隔离、幂等或路由，也未发起真实业务请求或写入。

有一次带多余 `--` 的 pnpm 调用使 Vitest 未筛选目标文件并开始 Desktop 全量测试；该进程随即被中断（exit 130），不作为验收证据。之后红、绿运行均使用直接的单文件 Vitest 命令。

## 生产构建与受控浏览器接续

主代理统一执行 Desktop 全量测试（150 文件、896 项）、类型检查及生产构建，均通过；边界和静态 accessibility 13 项通过。完整命令与共同检查范围见[同批 UI 记录](2026-10-18-ui-global-legacy-recovery.md)。

IAB 最终使用 `assets/index-BGHtuTvb.js`。仅在浏览器 GET 响应副本中把一个旧成交标为 `VERIFIED`，未改 Server 记录；输入数量 101 与更正原因后截留替换 POST。新命令为 `UNVERIFIED`，旧样本仍为 `VERIFIED`。返回受控 503 后数量和原因均保留；清除拦截并真实回读，原账本事件及 `ledgerRevision` 与验收前完全相同。回执为 `.recovery-artifacts/ui-global-2026-10-18/trade-verification.json`，截图为同目录 `trade-replacement-unverified-390.png`。

首次开发预览仍返回旧 helper，捕获的命令沿用旧状态，没有计入通过。停止该自建服务、统一构建并改用生产产物后，上述复验通过。该过程未更新 Docker、安装版或真实规则来源，也不关闭 T18 的规则包、来源版本/有效范围及 Provider/DSA 正向验收。
