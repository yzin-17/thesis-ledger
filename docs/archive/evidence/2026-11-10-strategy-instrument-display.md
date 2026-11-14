# 策略标的名称展示验收

日期：2026-11-10。对应[规格](../../specs/2026-11-10-strategy-instrument-display.md)与[任务](../tasks/2026-11-10-strategy-instrument-display.md)。

## 实现与范围

服务端经 Market 的 `InstrumentDisplayService.resolveDirectory` 批量解析执行标的和信号来源，在策略列表、策略创建及版本创建响应中附加 `instrumentDirectory`。每个版本只保留其关联的目录项；原始 Schema 保持原样。边界检查要求策略读取保留公共名称投影。

Desktop 编辑、列表、当前定义、普通与净值回测配置、策略风险应用入口复用名称投影；执行标的标签仅显示“执行标的”。已知名称可直接传入共享选择器，编辑会话在切换常用配置与高级 JSON 时保留新选名称。Mobile 编辑、列表、详情和净值回测配置同步消费，选择器聚焦使用代码、失焦显示名称，业务提交继续使用代码。

排查保留了历史回测结果与完整 JSON 的原始身份语义。共享目录缺失、歧义与故障继续回退完整代码。

## 定向验证

命令均在主仓执行，使用 `pnpm`：

| 输入范围与命令 | 结果 |
| --- | --- |
| Server：`pnpm --filter @thesis-ledger/server exec vitest run test/backtest/strategy-instrument-display.test.ts test/backtest/services.test.ts test/instrument-display.service.test.ts` | 10 项通过；含跨策略一次批量查询、同代码不同市场、重复代码、未知与故障回退、原始定义不变 |
| Desktop：`pnpm --filter @thesis-ledger/desktop exec vitest run src/features/strategy/strategy-instrument-display.test.tsx test/strategy-instrument-selection.ui.test.tsx test/strategy-library-ui.test.tsx test/strategy-version-summary.test.ts test/strategy-risk-application.test.ts` | 最终 21 项通过；含已有回显、重新挂载、聚焦、取消、更换、清空、切换 JSON 后名称保留及提交代码 |
| Mobile：`pnpm --filter @thesis-ledger/mobile test test/parity/strategy-instrument-display.test.tsx test/parity/strategy-instrument-selection.test.tsx test/parity/instrument-picker.test.tsx test/parity/batch4-ui.test.tsx` | 最终 19 项通过 |
| `pnpm --filter @thesis-ledger/schemas build`、`pnpm --filter @thesis-ledger/api-client build` | 通过 |
| Server、Desktop、Mobile 的包级 `typecheck` | 通过；最终客户端变更后已复验 Desktop 与 Mobile |
| `pnpm --filter @thesis-ledger/desktop build` | 最终通过；保留既有大 chunk 提示 |
| `node --test scripts/instrument-display-boundaries.test.mjs` | 4 项通过 |
| `node scripts/check-boundaries.mjs`、`GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs`、`git diff --check` | 通过；文件尺寸门禁有 6 项未增长的历史告警 |
| 本次名称链路写集的 ESLint 检查 | 0 个错误 |

第一次类型检查引用了尚未重建的 API 客户端声明，重建后通过。Context Mode 默认 Node 的原生绑定签名不兼容；ESLint 改用现有 `/Users/yzin/.volta/tools/image/node/26.13.0/bin/node` 完成，未修改依赖。

共享工作区的总量 lint 另有 `useRoutingRecommendation.ts` 及并发新增 `use-strategy-submission.test.tsx` 的错误。普通回测提交集成测试早先 5 项通过；共享 `BacktestSetupDialog` 与提交链路发生并发修改后复验为 3 项通过、2 项失败，错误包含 `FieldRootContext is missing`。这些提交状态与失败展示改动超出本次名称写集，原样保留；本记录不认证该并发提交改动或全仓 lint 通过。

## 目标运行态

- 执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。
- 正式入口：`./scripts/sync-code.sh thesis-ledger`；目标为 `thesis-ledger` 与 `backtest-worker`。
- 环境仅补充现有 Node、pnpm 与 Docker CLI 所在 PATH；无业务配置参数。第一次 PATH 缺少 Docker CLI，预检退出 1，未进行状态变更；补齐后执行退出 0。
- 主进程和 Worker 均健康；服务端及 domain、schemas、shared 构建产物已同步。镜像 ID 保持 `sha256:a466269ba07d7c97a53263319c7e1ef62460f1321d4492af3169e1f4c0ec7930`。
- 独立验证：实际 `/api/v1/backtests/strategies` 的目标 v2 响应包含贵州茅台目录项，`http://localhost:5173` 的实际编辑器直接消费成功。
- 这是容器可写层快更，重建容器后会恢复镜像内容；不构成镜像发布。Desktop 使用现有 Vite 页面，最终本地构建通过；Mobile 未执行设备安装。

## 浏览器验收

实际策略：`B4-Android-Authoring-Controlled`，v2。策略 ID 为 `c2d74980-d86b-4f88-aaf6-da62c8aa0b04`，版本 ID 为 `923d6f00-df77-47a2-be1a-9d2771edaff8`。

使用 Microsoft Edge 与 Playwright，脚本为 `/tmp/strategy-instrument-browser.cjs`，最终结果为 `/tmp/strategy-instrument-qa/results.json`。每页显式设置 viewport，并断言实际 `innerWidth`。

| 实际宽度 | 初次及重新打开 | 标签与回显 | 页面/抽屉横向溢出 | 聚焦后取消 |
| --- | --- | --- | --- | --- |
| 1440 | 通过 | 执行标的；贵州茅台 · 600519.SH | 无 | 无修改确认 |
| 1024 | 通过 | 通过 | 无 | 通过 |
| 768 | 通过 | 通过 | 无 | 通过 |
| 390 | 通过 | 通过 | 无 | 通过 |

截图分别为 `/tmp/strategy-instrument-qa/editor-1440.png`、`editor-1024.png`、`editor-768.png`、`editor-390.png`；已目检桌面及窄屏截图。输入框保持在抽屉边界内，窄屏标题正常换行。

实际列表、当前定义、普通回测摘要与风险应用入口均显示贵州茅台。回测摘要检查拦截了两个只读语义的 `POST /run-config/execution-model`，仅验证名称展示，不启动或认证回测准备。

受控搜索仅替换目录搜索响应为招商银行，验证选择后的名称、切换高级 JSON 再返回后的名称、JSON 内仍为 `600036.SH`、清空及放弃修改。浏览器禁止业务写入，最终业务写请求为 0、页面异常为 0；验收前后对全部策略版本的 ID 与 Schema 计算摘要，一致。真实业务记录未改写。

## 结论

AC1–AC4 的本次名称展示范围通过。共享工作区的并发回测提交与总量 lint 失败分别保留归属，不纳入本次通过结论。未执行 Git 提交。
