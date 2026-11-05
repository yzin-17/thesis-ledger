# 日线序列合同收敛

## 改动

- 将共享日线序列及其 identity、point、coverage、provenance 的公开类型和 Schema 收敛为无旧版本后缀的单一名称；原 `market-bar-series-v2.ts` 与测试文件改为 `market-bar-series.ts` 和 `market-bar-series.test.ts`，未新增并行版本文件。
- 图表 Reader 产出的序列 `contractVersion` 改为 `3`；详情、指标输入、Market Data V3、Server Risk/Market 消费及 Desktop 图表统一引用该类型。旧序列版本由 Schema 明确拒绝。
- 仅修改嵌套日线序列夹具；其他业务合同中的 `contractVersion: 2` 不据此推断为日线序列。

## 本地验证

- Schemas 全包 562 项、构建通过。
- Server、Desktop 类型检查通过；Market Server 定向 23 项、Desktop 行情详情定向 89 项、API Client 36 项通过。
- Server 全包 1686 项通过、81 项跳过；Server 与 Desktop 构建、模块边界检查通过。
- 源码中旧日线序列类型/Schema/文件路径反查为零，`git diff --check` 通过。

## 保留门禁

目标 Server/Worker/DSA 容器、真实客户端和 Provider 尚未更新验证；Market 其他旧合同、Backtest、Ledger 及 AC01–AC20 仍按原任务逐项验收。
