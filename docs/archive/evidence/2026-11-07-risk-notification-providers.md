# 风险通知提供方多选验证

日期：2026-11-07。对应[Spec](../../specs/2026-11-07-risk-notification-providers.md)与[Task](../tasks/2026-11-07-risk-notification-providers.md)。

## 实现与边界

通知页签提供“通知提供方”多选及保存操作。服务端返回完整可投递候选，未设置时按优先级升序、名称升序选第一家。设置保存在通知模块拥有的 `NotificationRoutingPreference` 中；停用或失效的已选提供方保留选择意图。读写接口为 `GET/PUT /notifications/routing/risk`，候选响应不含凭证。

风险投递按提供方分别建立 outbox，批次在数据库事务内提交；任一入队失败整批回滚并释放本次冷却占用。历史消息、状态和目标保持。其它通知主题继续每渠道优先选一家，通过事务锁复用渠道投递身份，提供方优先级变化不重开旧记录。通知列表显示实际提供方名称。

真实业务配置和通知记录只读；浏览器保存由受控请求承接，隔离数据库使用无外部投递的样本。没有发送真实通知，也没有更改真实提供方选择。

## 定向与包级验证

| 输入与命令 | 结果 |
| --- | --- |
| `pnpm --filter @thesis-ledger/server typecheck` | 通过，含通知入队兼容性补强。 |
| `pnpm --filter @thesis-ledger/server exec vitest run test/notification-runtime.test.ts test/risk/risk-notification-providers.test.ts test/http-validation.test.ts test/platform/database-structure.test.ts test/platform/database-upgrade-plan.test.ts` | 60 项通过；补强后重跑前两文件 25 项通过。 |
| `pnpm exec node scripts/test-risk-monitoring-runtime.mjs --notification-providers` | 49 份迁移，4 项隔离 PostgreSQL/Redis 测试通过；独立临时容器已清理，未操作开发数据卷。 |
| `pnpm --filter @thesis-ledger/schemas test` | 129 文件、1475 项通过；1 文件、3 项按原条件跳过。 |
| `pnpm --filter @thesis-ledger/api-client test` | 40 文件、208 项通过；新增读写契约后定向 `test/parity/c05.test.ts` 5 项通过。 |
| `pnpm --filter @thesis-ledger/desktop exec vitest run test/risk-center-interaction.test.tsx test/risk-actions.recovery.ui.test.tsx test/drawer-layout-contract.test.tsx` | 38 项通过。 |
| Server 与 Desktop 各自 `build` | 通过。 |
| 修改范围 `eslint`、`check-boundaries.mjs` | 通过。隔离脚本被既有 ESLint ignore 覆盖，实际执行通过。 |
| `check-migration-matrix.mjs`、`check-runtime-database-input.mjs` | 49 迁移、85 Prisma 表、16 raw-owned 表、101 表覆盖及运行时打包输入通过。 |
| `check-file-size-guardrails.mjs` | 通过，保留 6 处存量尺寸警告。 |

隔离测试覆盖旧结构中已送达记录升级后不变、默认与多选持久化、同一渠道双提供方分别入队和重复幂等、第二家入队失败后的整批回滚与冷却释放，以及其它主题在优先级变化后的并发幂等。没有启用外部发送。

## 受控浏览器

实际 Vite 页面与 Edge Chromium，1440、1024、768、390 四宽，20 个受控页面状态通过。覆盖默认选中、多选与选项回显、保存失败保留、保存成功及刷新重读、空选阻止、加载、无候选、读取失败、已选配置失效、聚焦与关闭，以及下拉弹层和页面边界。未发现页面横向溢出或运行异常；非路由保存的写请求为 0。截图与检查结果在 `/tmp/risk-providers-qa`，执行日志在 `/tmp/risk-providers-browser.log`。

## 共享工作区结果归属

Server 包级结果为 3937 项通过、18 项失败、402 项跳过，并有 1 个并发行情测试的未处理拒绝。本次迁移使两处版本断言失效，已更新并定向通过；其余 16 个失败位于 `market-chart-detail-v3.test.ts` 和 `market-chart-selector-v3.test.ts`，与工作区并行的分钟图表改动对应，未改动这些文件来扩大本任务通过结论。

Desktop 首次高并发包级结果为 1640 项通过、12 项失败。其中 11 项来自并发执行下的全局模式与收益工作区 UI 超时及后续断言，单 worker 重跑相关两文件 12 项通过；另一项是此前账户设置隐藏标题后的布局契约，已允许不占布局的无障碍标题并通过。最终以 `pnpm --filter @thesis-ledger/desktop exec vitest run --maxWorkers=2` 重跑：259 文件、1652 项全部通过。Server 的并发行情失败仍单独保留，未宣称全工作区全绿。

## 本地运行态

保留数据更新通过 infra 的 `scripts/update.sh thesis-ledger` 执行，设置 `DEV_DATABASE_MODE=upgrade` 并精确确认 `thesis-ledger-dev/thesis_ledger`。执行前只读核对实际数据库和 owner 均为 `thesis_ledger`。首次构建在 Alpine gcc 下载停滞，终止本次构建后使用维护脚本已有的 `BUILD_ALPINE_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/alpine` 参数重试，未更改依赖版本和签名校验。

重试退出 0。备份与演练证据在 infra `.database-upgrades/run.MNGzXk`，隔离演练从 `20261106030000_strategy_submission` 升到 `20261107010000_risk_notification_providers`，随后目标结构门禁通过。Server 与 Worker 均 healthy，四个通知模块构建产物的容器摘要与宿主构建一致；启动日志未发现相关缺表、缺模块或 Prisma 字段错误。

真实 `GET /notifications/routing/risk` 返回 200，当前可用提供方 1 家，默认选中优先级最高者；响应不含凭证。实际 `SchemaVersion` 为新 head，选择表记录数仍为 0，未通过验收写入真实选择。实际页面四宽各验证已选项、展开、关闭与边界，页面错误和写请求均为 0；截图与摘要在 `/tmp/risk-providers-real-qa`。同渠道多家保存和投递由前述受控页面与隔离数据库验证，不将真实单候选页面冒充多候选实源验收。

补充门禁：`check-workspace-dependencies.mjs` 通过。`lint-workspace.mjs --guardrails` 在 Desktop 首组报告 13 个错误、189 个警告；错误涉及研究、复盘、优化、行情与收益的其它文件，详细日志为 `/tmp/risk-providers-complexity.log`。本次新增的四个通知源码文件另以复杂度 20、禁止嵌套三元、函数长度 220 的 error 级规则验证通过；选择组件的状态派生已由独立 hook 承接，相关 38 项组件测试及 20 个受控浏览器状态重新通过。
