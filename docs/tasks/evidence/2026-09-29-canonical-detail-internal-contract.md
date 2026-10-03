# 详情内部旧合同拆除

> 2026-09-29。源码与相关包级门禁通过；公开详情响应和目标运行态仍需继续收敛。

## 变更与依据

- `MarketController.detail()` 只从 `MarketDetailService.getDetail()` 取得非图表分段及依赖状态，图表 BarSeries 与指标由当前 Reader 和 DSA V3 计算。内部 Service 现直接返回这三项，不再构造 `version: 1` 的完整详情响应。每个分段仍在返回前通过 Schema 校验。
- Schemas 删除已无生产消费者的 V1 Bar、逐指标数据与完整详情响应解析器。非图表分段仍校验报价、基金和筹码的当前数据；BarSeries 与指标分段改用现行读取结果 Schema。当前指标结果新增时间戳严格递增校验，保留旧合同原先覆盖的顺序拒绝能力。
- 公开详情仍使用 `marketDetailResponseV2Schema` 与 `contractVersion: 2`，当前 BarSeries 也仍为 V2 编号。本叶不宣称已完成公开响应替换或全局 C03。

## 验证

- Schemas 定向 39 项、全包 562 项通过；类型构建通过。减少的旧合同测试仅覆盖已删除解析器，现行 BarSeries 顺序与指标结果顺序拒绝由当前合同测试覆盖。
- Server 内部详情与图表定向 13 项、全包 1686 项通过且 81 项跳过，类型/build、模块边界通过。
- API Client 36 项、Desktop 508 项通过，双方类型/build 通过。`git diff --check` 通过。
- 未执行目标容器、鉴权 HTTP、真实来源或 Electron 实机；C01/C03/E02/U01/U02/D02/D03 与多来源 M1/M2/M3、AC01–AC20 均保持未完成。
