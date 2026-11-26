# 风险规则通知设置统一验收

## 实现与兼容

公共默认值和结构位于 `packages/schemas/src/risk-notification-settings.ts`。普通规则使用既有 `parameters.notification`，策略应用使用既有 `notification` JSON。默认 30 分钟、范围 0–10080，零冷却不占用 Redis 锁；已有明确数值保留。更新保留其他参数和审计，不增加数据库结构。

Notifications 按具体提供方名称投递，同属飞书渠道的配置仍分别识别。失效提供方不改投；明确空选择或关闭通知不发送。旧记录没有本地提供方字段时保留原路由。原有关键级通知绕过冷却的行为保留，表单直接说明。历史投递不回写。

Desktop 普通规则与策略应用的创建、编辑均接入提供方选择；通知页移除全局选择和保存入口。列表中的策略生成规则进入所属应用编辑，Server 拒绝通过普通规则 API 保存无效的独立通知配置。Mobile 对应表单、序列化和所属应用入口同步维护。严重级别统一显示提示、警告、严重、关键。

工作区有其他任务改动，结论仅覆盖本轮输入；未提交或推送。首次 Server 构建遇到提供方模块 `healthReset` 为 `boolean | null` 的类型错误，本轮仅为其补充 `Boolean(...)`，保留真假值语义及其他改动，随后构建通过。

## 自动检查

| 范围 | 验证入口 | 结果 |
| --- | --- | --- |
| 契约 | schemas `test/risk-notification-settings.test.ts` | 7 项通过 |
| Server | risk-state-machine、strategy-runtime、risk-rule-notification-settings、risk-notification-providers、strategy-rule-notification、strategy-risk-application-update、strategy-risk-application-identity | 7 文件 49 项通过 |
| Desktop | risk-center-interaction、risk-threshold-precision、risk-rule-notification-form、strategy-rule-notification、strategy-risk-application | 5 文件 54 项通过 |
| Desktop 恢复 | market-experiment-recovery 中风险相关用例 | 3 项通过，实验范围未扩大结论 |
| Mobile | `vitest run --exclude 'release/**' test/parity/strategy-rule-notification.test.ts test/parity/batch4-state.test.ts` | 12 项通过 |
| 构建 | Server、Desktop 各自 `build`；Mobile `tsc --noEmit` | 通过 |
| 边界 | `node scripts/check-boundaries.mjs` | 通过；新增通知页职责门禁 |
| 复杂度 | `NODE_OPTIONS=--max-old-space-size=6144 node scripts/lint-workspace.mjs --guardrails` | 8 组 3760 文件通过 |
| 尺寸 | `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs` | ratchet 通过，5 项存量警告 |

覆盖默认、明确零、已有 60/90/120 分钟、重复与无效提供方、普通规则参数合并及回显、审计、精确投递、失效不改投和旧路由兼容。

## 真实浏览器中的受控验证

工具统一使用 Microsoft Edge；真实 API 被拦截，不提交真实业务或发送通知，不调用行情 Provider。

- Desktop：`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright node scripts/local-runtime/browser/risk/risk-notification-unification.regression.mjs`。在现有 5173 开发服务实际挂载普通规则创建/编辑、策略应用创建/编辑和 RiskCenter 通知页，1440、1024、768、390 四宽度共 20 场景通过。验证默认/旧值、具体提供方选择、零冷却、首次 503 后输入保留、再次保存和重新打开回显，通知页无全局输入及保存按钮。产物 `/tmp/risk-notification-unification-qa/`。
- Mobile：`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright node scripts/local-runtime/browser/risk/risk-notification-mobile.regression.mjs`。React Native Web 实际挂载普通 RiskRuleForm、策略 RiskNotificationFields 及对应序列化，四宽度共 12 场景通过。覆盖普通创建、编辑与策略通知字段，503 后保留输入、重新核对及保存。产物 `/tmp/risk-notification-mobile-qa/`。隔离 Runtime 提供原生导航等环境边界，不作为实体设备验收；未修改原生工程，不触发 Native compile。

临时 Mobile 服务使用独立 5196 端口和缓存，结束后关闭。初次样本扫描到历史发布目录后已限定入口；编辑恢复样本补齐旧规则读取结果。旧关闭回归工具首次遇到开发服务重载，之后发现共用临时 Playwright 目录缺少包入口，改用任务独立临时目录 `/tmp/thesis-risk-notification-qa/` 安装同版本 `playwright@1.65.0` 后继续；未更改仓库 manifest 或 lockfile。最终使用 `PLAYWRIGHT_MODULE=/tmp/thesis-risk-notification-qa/node_modules/playwright RISK_RULE_QA_OUTPUT=/tmp/risk-unification-regression-qa node scripts/local-runtime/browser/risk/strategy-rule-notification.regression.mjs`，四宽度共 20 个保存、关闭、取消及指定路由导航场景全部通过。

## 本地部署验收

从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行正式 `./scripts/sync-code.sh thesis-ledger`，无附加业务参数。首次在宿主入口产物缺失时退出 1，未替换容器；只读检查发现并行构建使用相同 dist。另一次遇到其他进程持有更新锁而退出 1，未删除或绕过锁。并行工作结束后的同一入口最终退出 0，Server/Worker 皆 healthy。最终日志 `/tmp/risk-notification-unification-sync-accepted.log`；此前失败日志分别为 `/tmp/risk-notification-unification-sync.log` 和 `/tmp/risk-notification-unification-sync-final.log`。

独立只读验证：Server 容器中的普通规则和策略应用默认均为 30，明确零仍为零；调用实际部署的提供方筛选函数并使用内存候选 A/B，只返回所选 B，不访问外部提供方。Worker 容器具有新筛选代码及 30 分钟公共默认。实际规则读取接口返回 200，3 条普通规则均具有通知冷却投影，未输出或修改业务数据。

Server 和 Worker 当前镜像均为 `sha256:6c08cbe3666e399ef084d29b951e7f46fbe00b7fd85b4544b2f6aefcf628d885`；本次快更报告镜像保持不变，不执行数据库结构或外部卷变更。本结果只证明容器可写层更新，重建容器后失效，不作为生产镜像发布证据。

## 最终一致性审查

AC1–AC6 均有对应实现与证据。普通规则字段与策略应用字段共享公共默认和提供方身份合同；生成规则的编辑回到应用所有者，未增加第二份运行事实源。历史参数、明确数值、投递快照和真实数据保持原意。工作区并行改动保留；本次未提交或推送，无未决验收事项。
