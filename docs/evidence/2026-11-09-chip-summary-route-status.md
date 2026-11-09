# 筹码摘要路由及不可用状态验收

## 界面行为

- 行情分段通过共享 Badge 语义变体展示状态，不可用使用 `destructive`，可用使用 `secondary`，陈旧、空数据和不支持使用 `outline`。
- `capability_not_enabled`、`capability_unsupported`、`market_data_unauthorized`、`market_data_contract_invalid` 隐藏重试；超时、来源临时失败、策略暂不可读及日线依赖暂不可读继续允许重试。
- 共性修改覆盖报价、历史行情、技术指标、筹码摘要、最新基金净值和基金净值历史。技术指标缺少历史序列的独立重读入口保留，其用途是重新读取依赖序列。
- 诊断编号在窄屏自动换行，保留原错误说明和编号。

## 数据源核查与生效配置

当前运行时完整能力目录与 Provider 注册表中，只有 AKShare／东方财富和 Tushare 声明支持中国内地股票的 `CHIP_SUMMARY`。AKShare／东方财富已就绪；Tushare 当前账号检查为 `not_included`，原因为 `account_level_insufficient`。其余已接入来源未声明该能力；该结论不代表厂商全部外部产品的能力范围。

经用户授权，通过 `PUT /api/market-data/policy` 新增 `CN / STOCK / CHIP_SUMMARY -> akshare / eastmoney`。使用 `expectedRevision: 192`，保存后版本为 193，`syncState: applied`，生效投影确认目标 `eligible: true`、原因为空。其余 116 条原路由经结构比对保持一致。

实际调用 `GET /api/market/600036.SH/detail?include=chip&refresh=true`，约 6.25 秒返回：

- 分段状态：`ready`；来源：`akshare`。
- `servedFromCache: false`，`fallbackUsed: false`。
- 原始平均成本：`39.15`；获利比例：`0.9806969491745273`；集中度：`0.07283221211822433`。
- 70% 区间：`[37.74, 42.08]`；90% 区间：`[36.92, 42.72]`。
- 来源计算日期：`2026-11-09T00:00:00+00:00`。界面格式化为平均成本 ¥39.15、获利比例 98.07%、集中度 7.28%，未改写原值。

配置前、计划输入、生效结果和实际行情响应分别保存在 `/tmp/chip-policy-before.json`、`/tmp/chip-policy-planned.json`、`/tmp/chip-policy-saved.json`、`/tmp/chip-live-detail.json`；执行脚本为 `/tmp/configure-chip-route.cjs`。

## 验证结果与边界

- 定向测试：4 个文件、35 项通过，命令为 `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail/market-detail.types.test.ts src/features/market-detail/MarketDetailSections.status.test.tsx src/features/market-detail/MarketDetailSections.empty.test.tsx src/features/market-detail/MarketDetailDialog.test.tsx`。
- 行情详情回归：`pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail`，49 个文件、240 项通过。日志：`/tmp/chip-ui-market-tests.log`。
- 四个修改及新增源码文件的定向 ESLint 通过；`pnpm --filter @thesis-ledger/desktop build` 类型检查及构建通过，保留原 chunk 大小提示。日志：`/tmp/chip-ui-lint.log`、`/tmp/chip-ui-build.log`。
- Microsoft Edge 在 1440、1024、768、390 宽度运行实际 `ChipSection` 与共享 Badge/Button，检查三类不可重试错误、超时重试点击、错误色与正常色、横向溢出，以及真实响应的显示。四种宽度均通过，已查看窄屏不可用和成功截图。
- 浏览器失败状态使用受控输入；成功状态使用上述真实服务端响应，由浏览器挂载实际组件展示，不作为完整详情弹窗端到端验收。脚本为 `/tmp/check-chip-ui.cjs`，结果及截图位于 `/tmp/chip-status-qa/`。Vite 开发热更新 WebSocket 被浏览器本地网络策略阻止，不影响页面 HTTP 加载、组件操作和本次截图；未出现页面脚本异常。
- 配置由实际 Server API 持久化生效；已更新宿主机 Desktop 构建产物。本次未执行 Docker 状态变更，未修改真实业务交易或研究事实。
