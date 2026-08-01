# 全新数据库 Desktop Onboarding 证据

## 执行信息

- 日期：2026-08-01
- 目标：临时空 PostgreSQL 数据库 `investment_os_onboarding_20260801`
- 入口：macOS release `Investment OS.app`，通过 `INVESTMENT_OS_API_URL=http://127.0.0.1:3111` 连接临时 Server
- 截图：[fresh-onboarding-complete.jpeg](fresh-onboarding-complete.jpeg)

## 已完成闭环

未预置账户、持仓或风险规则的数据库中，按 UI 首次引导依次完成：

1. 创建账户 `Fresh Onboarding 20260801`。
2. 手动录入证券 `000001.SZ`，数量 `20`，成本价 `100`。
3. 在 Risk 页面创建 `price-below` 证券级规则，阈值 `120`，严重级别 `warning`，版本 `1`，启用状态为 `true`。
4. 返回 Portfolio，确认总成本 `¥2,000.00`、当前市值 `¥233.60`，且持仓表显示 `000001.SZ` 数量 `20`。

临时 API 的最终响应核对如下：

- `/api/v1/accounts` 返回 1 个 active manual securities account，名称为 `Fresh Onboarding 20260801`。
- `/api/v1/portfolio/positions` 返回该账户的 `000001.SZ` ledger position，`quantity=20`、`costPrice=100`。
- `/api/v1/risk/rules` 返回 1 条 enabled `price-below` security rule，`threshold=120`、`version=1`。

## 边界

该证据证明空数据库的新用户可以不读开发文档完成账户、手动持仓和风险规则基础闭环。该次临时环境没有提供 Feishu 凭据，因此没有把 Feishu/Data Provider 配置或外部连通性测试宣称为已完成；后续已补充 Provider 配置表单并在 fixture release 中验证凭证引用提交后仅显示“已配置”（见 `provider-onboarding-configured.jpeg`），T277 仍保留真实凭据和目标环境验收边界。
