# I01 传输请求标识与完整响应摘要核对

## 结论

任务：`CONT-I01-request-identity`。状态：已排除本叶假设。当前不可变单窗口 `completeResponseHash` 不保留传输 `requestId` 的值；同一响应仅更换 `requestId`，摘要相等。该结论仅关闭这一具体假设，I01 原生产 Reader 失败及父项仍开放。

## 静态证据与二次调用链核对

- `apps/server/src/market/market-frozen-window-v3.ts:12` 的单窗口分支先执行严格 Schema 解析，再于第 20 行把 `requestId` 覆盖为固定值 `frozen-market-window-v1`，最后对该对象执行 `JSON.stringify` 与 SHA-256。
- `apps/server/src/market/market-bar-reader-v3.ts:139` 为选择请求生成 `randomUUID()`；第 157 行将选择响应交给 repository 的 `record`。`apps/server/test/backtest/worker-dsa-http-fixture.ts:83` 将请求标识回填到共享 fixture 响应，但后续仍走同一摘要入口。
- `apps/server/src/market/market-window-evidence-v3.repository.ts:223` 首次写入摘要调用 `marketFrozenWindowHashV3(response)`；第 328–329 行重复写入同时比较新输入摘要和既有完整响应重算摘要；第 349 行 `findFrozen` 亦用同一入口检查完整响应。没有在这些路径另行以原始 `requestId` 计算 `completeResponseHash`。
- `apps/server/src/market/market-frozen-window-reader-v3.ts:32` 调用 `findFrozen`；派生窗口需要重新记录时，第 65 行调用 `record`。这次独立静态核对没有发现绕过归一入口的冻结校验分支。

## 一次离线计算

使用现有 `tsx v4.23.1` 与当前生产摘要函数，读取共享固定输入 `packages/schemas/fixtures/market-data-v3.response.etf-qfq.json`，构造两个仅 `requestId` 不同的内存对象。没有修改源码、测试或生成构建产物。

```sh
rtk proxy pnpm --filter @thesis-ledger/server exec tsx -e 'import { readFileSync } from "node:fs"; import { marketFrozenWindowHashV3 } from "./src/market/market-frozen-window-v3.ts"; const response = JSON.parse(readFileSync("../../packages/schemas/fixtures/market-data-v3.response.etf-qfq.json", "utf8")); const first = { ...response, requestId: "offline-request-a" }; const second = { ...response, requestId: "offline-request-b" }; console.log(JSON.stringify({ changedFields: ["requestId"], hashEqual: marketFrozenWindowHashV3(first) === marketFrozenWindowHashV3(second) }));'
```

退出码：`0`。脱敏输出仅为：

```json
{"changedFields":["requestId"],"hashEqual":true}
```

此处是现存共享 fixture 的机制核对，不是原失败请求或 ORM 回读载荷复原。

## 原失败证据边界

`docs/tasks/evidence/2026-09-27-worker-runtime-integration.md:61` 保留第二条同窗口创建失败及两次重试事实；第 63–66 行记录来源基准、覆盖证明一致，新输入完整响应摘要与存量摘要一致，而 ORM 回读完整响应重算摘要不一致。这与“第二次传输 requestId 导致新输入摘要不同”的假设不符。

`docs/tasks/evidence/2026-09-28-cont-m1-frontier.md:32` 的 I01 边界继续适用：原 ORM 回读完整响应未恢复，不能据本叶选定其他根因或摘要修复。本叶无源码修复写集，无新增测试需求，不扩展到其他假设。

## 执行账

唯一写入为本证据文件；所有其他 WIP 保留。新增真实请求 `0`、重试 `0`、数据库写 `0`。未启动 Worker、Reader 集成门禁、HTTP、数据库、Provider、AI、浏览器或构建，未执行全包测试。离线命令已正常退出，无本叶遗留进程。
