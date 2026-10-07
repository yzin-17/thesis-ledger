# 当前 Market 路由目标合同收敛

## 改动与边界

- 将现行 V3 路由、目录、事件准入与兼容性计算共同使用的目标身份结构移至 `packages/schemas/src/market-route-target.ts`，导出 `marketRouteTargetSchema` 与 `MarketRouteTarget`。
- 删除已无生产消费者的 `market-route-v2.ts` 及其两项旧策略测试；现行合同仍拒绝带 `routeV2` 的旧信封。
- 引用反查未发现 `routeTargetV2Schema` 或 `market-route-v2` 在 Schemas 源码及测试中的剩余引用。

## 本地验证

- Schemas 定向 58 项、全包 546 项通过；Schemas 构建、Server/Desktop/API Client 类型检查、模块边界和 `git diff --check` 通过。
- 对本叶涉及文件执行整文件 Prettier 检查时，`market-route-v3.ts` 与 `market-event-admission-v3.ts` 未通过；格式建议涉及本叶没有修改的多个区段，本叶未扩大写集做整文件格式化。该格式门禁保留为未通过。

## 尚未验收

目标 DSA/Server HTTP、目录增量和真实客户端均未在同源目标运行态验收；C03、E02、E04、U01、D02 与 D03 保持未完成。
