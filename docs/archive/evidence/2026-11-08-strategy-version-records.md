# 策略版本关联记录验收

日期：2026-11-08。对应[规格](../../specs/2026-11-08-strategy-version-records.md)及[任务](../tasks/2026-11-08-strategy-version-records.md)。

## 根因与实现

服务端已有回测任务的 `strategyVersionId`、实验的 `baselineStrategyVersionId` 关联以及按版本过滤的读取接口。此前详情两个页签只呈现说明或创建入口，没有读取记录。本轮复用现有接口，按当前版本读取分页回测和已有策略实验，新增独立组件并复用共享表格、状态、结果摘要与刷新反馈。

回测包括准备失败、执行失败和已完成记录；实验创建链接保留当前版本参数。历史实验读取不再受当前定义可执行性限制，创建动作仍要求有效定义。查询键与分页按版本隔离、切换版本重新挂载，新增请求传递 AbortSignal；不暂用其他版本数据。默认服务端每页 20 项。交付及创建使对应记录缓存失效，页头刷新与活动任务轮询更新数据。

## 验证记录

| 检查 | 命令／输入 | 结果 |
| --- | --- | --- |
| 新增交互 | `pnpm --filter @thesis-ledger/desktop exec vitest run test/strategy-version-records.ui.test.tsx` | 4 项通过；覆盖精确版本过滤、失败详情入口、分页重置、迟到响应、创建版本参数、禁止创建时读取历史、刷新保留记录和单个加载圈、失败重试 |
| 相关回归 | `pnpm --filter @thesis-ledger/desktop exec vitest run test/strategy-summary-ratio.test.tsx test/strategy-backtest-detail.test.ts test/backtest-preparation-failure.ui.test.tsx test/strategy-center-ui.test.tsx` | 33 项通过 |
| 包级回归 | `pnpm --filter @thesis-ledger/desktop test` | 267 个测试文件、1697 项通过；之后仅将新增测试中的异步失效包入 act，新增 4 项再次通过 |
| 构建与静态 | Desktop 构建、修改文件 ESLint、`node scripts/check-boundaries.mjs`、`git diff --check` | 通过；构建保留既有体积提示 |

本机日志：`/tmp/version-records-tests.log`、`/tmp/version-records-focused.log`、`/tmp/version-records-desktop-suite.log`、`/tmp/version-records-build.log`、`/tmp/version-records-eslint.log`、`/tmp/version-records-final-eslint.log`、`/tmp/version-records-boundaries.log`。

## 真实与受控页面

真实读取截图版本 `cdcb774b-3ea8-4f7f-a336-a2579eebfe97`：现有接口返回失败任务 `26ac1c17-e23d-4de0-88a8-e4acf0347f2e` 与已完成任务 `f1c53b62-d2f2-4c72-b1f9-d3327e9591ea`，均精确关联该版本；实验数量为零。结果保存于 `/tmp/version-records-real-api.json`。没有回填、变更或创建业务关联。

1440、1024、768、390 宽度下，浏览器使用真实回测列表与失败详情；实验列表使用既有有效响应的受控副本，仅修改展示名称和来源关联。验证回测页签、详情导航、实验行与创建链接、同范围刷新、失败保留记录、重试、空态及带版本参数的创建页导航，共 28 组通过。无页面横向溢出或脚本错误，窄屏表格在容器内滚动。已人工检查桌面与窄屏截图。

所有非 GET 请求均被拦截，实际业务写入为零；没有调用模型、创建实验或执行回测。浏览器结果和截图位于 `/tmp/version-records-browser/`；实验样本不代表截图版本已有真实实验。

## 运行态与交付边界

通过相邻 infra 的 `./scripts/sync-code.sh thesis-ledger` 同步最终输入，日志为 `/tmp/version-records-sync.log`。兼容性预检、构建及 Server／Worker 健康检查全部通过；本次仅更新容器可写层，不代表镜像重建。

本轮未改变数据库结构、服务端所有权与结果保护、数据源路由、策略定义或历史结果，也未提交推送。共享工作区其他修改不计为本次验收范围。

## 页签标题后续复核（2026-11-08）

按用户最新要求收敛页签标题操作，保留版本记录、详情链接与当前版本实验创建入口。现行 Spec 同步更新。复用现有 4 项定向测试通过，两个组件 ESLint 与差异空白检查通过；1440、1024、768、390 四宽共 8 组真实只读检查通过，无页面错误、横向溢出或业务写入。已人工查看桌面实验页签和窄屏回测页签。未重复执行此前包级全量测试。

通过 infra 的 `./scripts/sync-code.sh thesis-ledger` 同步本次源码，构建、兼容性及 Server／Worker 健康检查通过，镜像未变；仍为容器可写层更新。本机证据为 `/tmp/version-records-header-tests.log`、`/tmp/version-records-header-eslint.log`、`/tmp/version-records-header-sync.log` 与 `/tmp/version-records-header-browser/`。
