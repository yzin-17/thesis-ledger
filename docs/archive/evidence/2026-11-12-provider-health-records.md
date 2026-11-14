# 提供方健康记录统一验证

## 范围与基线

2026-11-12，当前共享工作区；既有其他未提交修改保留。任务与验收断言见[Spec](../../specs/2026-11-12-provider-health-records.md)及[Task](../tasks/2026-11-12-provider-health-records.md)。本轮不提交 Git，不发起外部模型测试，不更改提供方预算、启停、配置、当前路由验证凭证或页面布局。

## 诊断与转换规则

健康历史 API 返回 HTTP 200，原有 1060 条记录。客户端旧详情 Schema 拒绝当前 `ai_provider_validation` 的 kind 与状态。全库另有 3 条 `ai_provider_test`：2 条连接、1 条生成。

2 条事实完整的记录转为独立探测事件；1 条连接记录附带研究合同，归因无效，计划删除。现有验证事件及普通健康检查保持原值。独立探测不会生成用途验证所需的请求标识和路由指纹。

## 局部验证

- `pnpm --filter @thesis-ledger/schemas exec vitest run test/provider-health-details.test.ts`：2 项通过。
- `pnpm --filter @thesis-ledger/schemas build`：通过。
- `pnpm --filter @thesis-ledger/schemas test`：144 个文件、1569 项通过。
- `pnpm --filter @thesis-ledger/api-client test`：45 个文件、237 项通过；包含当前验证事件读取与旧详情拒绝。
- `pnpm --filter @thesis-ledger/server exec vitest run test/ai/ai-provider-test-audit.test.ts test/ai/ai-provider-management.test.ts`：33 项通过，覆盖实际测试生产者的成功、失败、取消及共享校验。
- `pnpm --filter @thesis-ledger/server typecheck`：通过。
- `node --test scripts/local-runtime/provider-health-record-conversion.test.mjs`：4 项通过，覆盖转换、删除、目标限制及状态事实保护。

Desktop 初次类型检查使用尚未重建的 API client 声明，因其仍引用旧详情类型失败；重建后又定位到诊断摘要读取联合类型的通用 `details.errorCode`，已统一使用 API 的顶层错误码。最终 `pnpm --filter @thesis-ledger/desktop build` 通过；`test/provider-failure-diagnostics.test.tsx` 的 2 项回归通过。

相关 TS/TSX 文件 ESLint 通过；维护脚本按仓库配置被 ESLint 忽略，由 Node 测试及真实事务演练验证。`check-boundaries.mjs`、`check-workspace-dependencies.mjs` 通过；文件尺寸检查返回 0，存在 5 条存量警告，本次未提供 baseline，不能据此声称全工作区增量 ratchet 已验证。Prettier 检查通过。未运行全仓 lint 或全仓测试。

## 数据库演练

实际数据库名称和 owner 均为 `thesis_ledger`；目标为 `thesis-ledger-dev-postgres-1`。只读计划为转换 2 条、删除 1 条。

首轮故障演练发现通用读取助手未配置 psql 的 `ON_ERROR_STOP`；已在本维护入口固定启用，SQL 错误以非零退出并回滚。随后根据 infra 的 `CommandFailure.stderr` 显式提取错误摘要，避免命令封装隐藏 SQL 原因。以上过程均为回滚事务，尚未正式修改记录。

最终演练命令：

```sh
node scripts/local-runtime/provider-health-record-maintenance.mjs --target thesis-ledger-dev --mode rehearse --output /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/provider-health-records-20261112-final-rehearse
```

结果：通过。逐行冲突在前序修改后触发整笔回滚，集合冲突拒绝执行；完整转换与删除也回滚，原 3 条记录及所有非目标记录保持一致。私有原件和报告保存在上述目录。

## 目标验收

### 运行态同步

执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，命令 `./scripts/sync-code.sh thesis-ledger`，退出 0。Server 及依赖宿主构建通过，Server/Worker 均恢复健康。同步更新容器可写层，镜像 ID 保持不变；未改依赖、数据库结构或卷。独立业务验证为下述全分页校验及真实页面读取，不以容器健康替代。

### 数据处理与重复执行

从主仓执行：

```sh
node scripts/local-runtime/provider-health-record-maintenance.mjs --target thesis-ledger-dev --mode apply --output /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/provider-health-records-20261112-applied
```

退出 0，事务已提交，转换 2 条、删除 1 条，旧记录剩余 0 条。删除记录 ID 为 `161676ee-b1dd-4546-8d21-3c4182977cc5`，原因是连接探测携带业务合同。事务内非目标健康记录摘要保持一致；SQL 写集仅包含目标健康检查表。

原件位于该输出目录的 `before.json`，统计位于 `report.json`；目录和文件分别为 0700、0600，已确认被 Git 忽略。以最终转换逻辑重新分析备份仍得到转换 2、删除 1 的相同结果。事务 SQL 使用经冲突检查的随机分隔符，输入数据无法结束其 DO 块。

随后以同一命令重复执行，输出目录改为 `.recovery-artifacts/provider-health-records-20261112-idempotent`：退出 0，转换 0、删除 0，非目标记录一致。最终维护脚本又在 `.recovery-artifacts/provider-health-records-20261112-final-noop` 完成空集回滚演练，结果通过。

### API 全分页

对真实 `http://localhost:3000/api/v1/providers/health/history?page=<页码>&pageSize=100` 的全部 11 页使用构建后的 `providerHealthPageSchema.safeParse` 校验：全部 HTTP 200，零校验错误。观察到 1060 条，其中普通检查 952、用途验证 81、授权操作 25、独立探测 2。相较最初普通检查增加 1 条，来自并行运行的正常健康检查；维护事务自身删除 1 条，未新增健康事实。

### 实际浏览器

```sh
PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright \
PROVIDER_HEALTH_QA_OUTPUT=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/provider-health-records-20261112-browser-final \
node scripts/local-runtime/provider-health-record-browser.mjs
```

使用 Microsoft Edge，真实 `http://localhost:5173/providers` 页面、真实本地 API。1440、1024、768、390 宽度均显示 20 行健康历史，无读取失败、页面错误、失败历史请求或页面横向溢出。1440 宽度下一页、上一页通过；390 宽度表格容器内横向滚动通过。已人工查看桌面和窄屏截图。

验收脚本拒绝业务写请求和远程地址，最终写请求为 0；未发起模型调用。首次浏览器脚本因 Vite 页面准备时间和父子 section 定位歧义失败，修正为定位健康区 `section[aria-busy]` 后两轮完整四宽验证通过；该修正只影响验收脚本。

## 变更范围与审查

- 共享契约：`provider-health-details.ts`、`provider-diagnostics.ts` 及 Schema 测试。
- 生产者：`ai-provider-test-audit.ts`，对应审计与管理测试。
- 消费者：Desktop 的 `providers.types.ts`、诊断摘要顶层错误码读取、API client 当前事件回归。
- 维护：`scripts/local-runtime/provider-health-record-*.mjs`、维护指南、Spec、Task、证据及导航。

最终审查通过：AC1—AC4 均有证据；当前独立探测与用途验证身份保持分离，原始计量精度及非目标数据保持。没有未完成的本任务验收项。当前有效合同留在 `docs/specs/`，实施 Task 与本证据归档；代码未提交。
