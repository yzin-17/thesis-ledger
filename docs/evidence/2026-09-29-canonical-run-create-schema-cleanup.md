# 回测创建 Schema 旧导出清理

## 变更

`packages/schemas/src/backtest-v2.ts` 删除已无生产调用的 V2 Run 创建 Schema、类型与旧合同集合导出。API Client 测试构造当前创建请求时直接使用当前 V3 Schema；不再先通过旧合同解析。基础 `runConfigSchemaV2` 仍被当前准备、策略优化和执行模型调用，不能仅凭名称删除；其领域职责留在 C03 核对。

## 验证

Schemas 回测 Schema 定向 16 项、API Client 传输定向 7 项通过；最终 Schemas 全包 563 项、API Client 全包 36 项通过。Schemas 构建及 API Client、Server、Desktop 类型检查通过。C03 的全调用方与目标运行态仍待核对。

## 边界

此叶只删除无调用方的创建入口，未改变现行 Run 的持久化、Worker 或用户交互；C02/C03/E01/U01/D02/D03 保持未勾选。
