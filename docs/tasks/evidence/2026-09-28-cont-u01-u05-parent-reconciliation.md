# U01 / U02 / U03 / U05 Desktop 父项收口对账

## 当前验证

当前工作区重新执行 8 个 Desktop 定向文件，共 **63 passed / 0 failed**：

- 路由与 Provider UI：`market-data-provider-ui` 11 项
- HiThink 预设：`market-policy-hithink-preset` 7 项
- 普通回测联合预检：`backtest-preflight-chain` 8 项、`backtest-preparation` 11 项
- 结果/模型披露：`backtest-model-disclosure` 5 项、`optimization-research-disclosure` 4 项
- 结果详情/诊断：9 项 + 8 项

随后在 `apps/desktop` 执行 `pnpm exec tsc -p tsconfig.json --noEmit`，退出 0。此前 U01-b 被两处优化表单 V3 RunConfig 类型问题连带阻断的历史状态已不再存在。

## U01

既有 U01-a/b 已实现 Server 精确 V3 能力目录读取与 Desktop 精确目录消费：none/qfq/hfq 独立主备、非 ready 中文原因、partial 禁用、Desired/Effective revision、单一保存入口与显式重试。当前 UI 11 项及 typecheck 均通过。

因此 U01 的本地保存/恢复/不可用原因消费已完成；真实 Catalog 与实际保存联通继续由 G-UI 验收。

## U02

[本地浏览器证据](2026-09-26-hithink-preset-browser.md) 已验证预览不改草稿、取消无修改、目录修订使预览失效、明确应用后只补可用 HiThink 路由且仍复用唯一保存按钮。当前预设 7 项继续通过，U01 前置现已完成。

## U03

[S07 联合预检消费证据](2026-09-27-u03-preflight-consumption.md) 已实现准备→联合预检、共享取消、修订失效、晚到隔离及诊断展示。S07 父项已完成；当前 preflight/preparation 19 项通过，Desktop typecheck 通过。目标浏览器/Electron 仍归 G-UI，不影响 U03 本地消费完成。

## U05

[结果披露证据](2026-09-27-u05-disclosure-audit.md) 已覆盖实际备用来源、口径、记账单位、分红语义、历史性质、成本、重放版本、旧/损坏响应和固定快照限制，并补 incompatible/unverified 评价组回归。当前披露、详情和诊断相关 26 项通过。

因此 U05 的本地结果语义与重放信息展示完成；真实目标 Run 的页面对应关系仍由 G-UI-159516 验收。

## 保留边界

本轮收口 `U01`、`U02`、`U03`、`U05`。不收口 `U04`：其独立图表 V3 主路径虽已有本地证据，但备用来源真实证明、撤销/策略修订运行态及目标浏览器/Electron 仍有明确未完成子叶。真实 UI 总验收继续归 `G-UI`。
