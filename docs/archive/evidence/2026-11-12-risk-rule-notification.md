# 单条策略风险规则通知设置验收

## 实现范围

- `notification.ruleOverrides` 按 `sourceKey` 保存可选的 `severity` 和 `cooldownMinutes`，未设置字段分别继承应用默认值。冷却范围为 0–10080 的整数，零保留为零。
- 使用现有通知 JSON；不增加数据库列或迁移。策略编译结果、条件和计划哈希保持原职责，通知参数不参与策略身份。
- 创建和更新拒绝不属于当前计划的规则键。冻结规则保存各自严重级别；实际评估事件与通知投递使用各自有效配置，应用共享开关和渠道。
- 升级在同一事务内保留仍存在的规则设置、移除失效键并重建冻结规则；既有审计和历史事件不回写。
- Desktop 生成预览和风险中心编辑复用 `StrategyRiskRuleSettings`。Mobile 的创建、编辑和提交凭据同样保留逐条设置。旧版面板的应用编辑保留该字段；该面板的唯一引用为当前没有路由消费者的 `StrategyOptimizationWorkspace`，未另建一套生成流程。
- 新控件复用共享 Field、Input、Select 与已有中文严重级别映射；Mobile 使用内容分区组件。未增加 CSS、依赖或原生工程配置。

## 本地验证

测试基线是本工作区的未提交源码，包含其他任务已有改动；以下结论只覆盖列出的输入和场景。

| 验证 | 命令或范围 | 结果 |
| --- | --- | --- |
| 契约构建 | `pnpm --filter @thesis-ledger/schemas build` | 通过 |
| Server 规则和生命周期 | `pnpm --filter @thesis-ledger/server exec vitest run test/risk/strategy-rule-notification.test.ts test/risk/strategy-runtime.test.ts test/strategy-optimization/strategy-risk-application-update.test.ts test/strategy-optimization/strategy-risk-application-identity.test.ts` | 25 项通过；新增身份测试后重跑其中 3 文件 11 项通过，runtime 的 14 项输入未变化 |
| Desktop 表单与风险恢复 | `pnpm --filter @thesis-ledger/desktop exec vitest run test/strategy-rule-notification.test.ts test/strategy-risk-application.test.ts test/market-experiment-recovery.ui.test.tsx -t "风险\|冷却\|逐条\|同源\|配置指纹\|账户请求"` | 14 项通过，7 项非本次范围跳过 |
| Mobile 状态与序列化 | `pnpm --filter @thesis-ledger/mobile exec vitest run --exclude 'release/**' test/parity/strategy-rule-notification.test.ts test/parity/batch4-state.test.ts` | 11 项通过 |
| 类型检查 | Server、Desktop、Mobile 分别执行 `pnpm --filter @thesis-ledger/<应用> exec tsc --noEmit` | 通过；最终 Server/Mobile 再次检查通过 |
| 应用构建 | `pnpm --filter @thesis-ledger/server build`、`pnpm --filter @thesis-ledger/desktop build` | 通过 |
| 定向 lint | 本次规则控件、表单转换、Server 通知/冻结/应用服务及 Mobile 通知字段共 10 个实现文件 | 0 错误、0 警告 |
| 模块边界 | `node scripts/check-boundaries.mjs` | 通过；沿用既有 `strategy-optimization → risk` 方向，未新增反向依赖 |
| 整仓复杂度检查 | `NODE_OPTIONS=--max-old-space-size=6144 node scripts/lint-workspace.mjs --guardrails` | 8 组 3737 文件通过；保留存量复杂度警告 |
| 文件尺寸 | `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs` | ratchet 通过，5 项存量警告 |
| 空白检查 | 本次修改路径执行 `git diff --check` | 通过 |

验证覆盖字段分别继承、明确零值、非法整数/范围/级别、未知规则键拒绝、创建参数保存、冻结严重级别、更新默认值与清除覆盖、两条规则实际评估事件和通知策略分别取值、升级清理失效键。

## 浏览器验收

入口：`apps/desktop/test/browser-strategy-rule-notification.html`；执行工具：`scripts/local-runtime/browser/risk/strategy-rule-notification.regression.mjs`。使用 Microsoft Edge 无头浏览器和现有 `http://127.0.0.1:5173` 开发服务。实际挂载生成抽屉及风险中心通知编辑器，API 路径全部拦截，未向真实业务提交。

命令：`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright node scripts/local-runtime/browser/risk/strategy-rule-notification.regression.mjs`。

1440、1024、768、390 四种宽度，各覆盖创建与编辑，共 8 个场景全部通过。检查了无横向溢出、下拉中文回显、键盘聚焦、逐条编辑、越界错误、首次 503 后输入保留、再次提交成功及独立请求内容。实际请求分别包含“成本止损：严重／0 分钟”和“最大持有周期：继承级别／120 分钟”。浏览器无未登记 API 请求或页面异常。截图与结构化结果位于 `/tmp/strategy-rule-notification-qa/`，可由维护脚本重新生成。

本轮 Mobile 使用实际表单转换、状态测试和类型检查；未运行实体 Android/iOS 设备验收。未修改原生依赖、插件或构建配置，因此本次不触发 Native compile 门禁。

## 本地运行态

- 执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。
- 正式入口：`./scripts/sync-code.sh thesis-ledger`，无附加非默认业务参数，退出 0。运行日志为 `/tmp/risk-rule-sync.log`。
- 脚本兼容性预检通过，构建并同步 Server/domain/schemas/shared，Server 与 backtest-worker 均恢复 healthy；未执行数据库结构变更。
- 独立只读检查 Server 与 Worker 的 `/app/apps/server/dist/src/risk/strategy-risk-notification.js` 均存在；Server runtime 已引用解析器。在 Server 容器内执行纯函数，单条止损输出 `error / 0`，未覆盖规则输出 `warning / 60`。
- Server 镜像为 `sha256:8066e62ea225285e281698676d3dfad77a481fa253e24fc235e8e1aa9360764f`，脚本报告 Server/Worker 镜像均保持不变。此结果仅证明容器可写层快更，容器重建后失效，不作为生产镜像发布证据。
- 真实业务数据保持只读，未发送真实通知，未为验收调用外部行情来源。

## 诊断与结论边界

首次 Context Mode 命令缺少 pnpm 路径，显式配置工具路径后才开始有效检查。浏览器样本起初缺 `institution`，已补全；API 拦截最初误匹配源码路径，已限定 `/api/`；逐条字段增加了包含规则名称的可访问标签，最终全部场景通过。

Desktop 恢复测试首次全文件执行有 2 项失败：风险项缺少展开通知设置的步骤，已修正并通过；实验“锁定并运行封存测试”入口的失败属于本次范围外，未作为通过结论。Mobile 初次命令扫描到历史 `release/` 验收副本并遇到缺失 fixture；改为限定当前源码后 11 项通过。

整仓复杂度检查首次 Server lint 内存不足退出；使用 Node.js 24 与 6144 MiB 检查堆重跑后完成。React Native Flow 依赖解析产生诊断噪声，但最终门禁退出 0。首次运行态检查误用不含 `src` 的 dist 路径，按容器真实启动入口纠正后通过。

最终一致性审查通过：AC1–AC5 的实现、当前测试与浏览器/运行态证据对应；现有默认行为兼容，工作区既有改动保留。本次未提交或推送。
