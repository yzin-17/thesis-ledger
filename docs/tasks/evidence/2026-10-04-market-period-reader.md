# 行情周期真实读取编排证据

对应 [Task](../2026-09-16-market-chart-period-aggregation.md) 的 T3.2b2。实现与真实来源成功验收拆开记账，父任务继续开放。

## 编排实现

`MarketPeriodReader` 注册在 MarketModule，只依赖当前 Market 日历读取与原生 MarketBarReader。调用者显式提供完整日历范围；规划可见桶与预热桶后，以原生 1d 请求完整基础起止范围和 3650 条上限。它不借用回测编排、不改变 Provider 的周期声明。

事实获取后固定 evaluationAsOf、重读日历并重新规划。基础起止窗口变化只允许一次重新获取，持续变化返回 window_changed；时钟倒退或微秒依据晚于最终时刻拒绝。正式装配核验请求身份、实际采集窗口和基础点/完整价格口径；空来源、传输失败、非法来源和日历失败分别降级。真实缺日保留 unknown，不由日历补出价格或零值。

## 本地结果

读取编排 13 项、纯装配 22 项、完整窗口 16 项，共三个文件 51 项通过。覆盖固定时刻、有界重取及收敛、来源传输失败不重试、获取后日历失败、空/非法来源、窗口不匹配、缺日、非法身份与时间证据。Server 类型检查、build、定向 ESLint/复杂度上限 20 与 Import boundaries 通过；本叶没有新增数据库、运行时依赖或部署配置。

首次测试的 ISO 字符串预期与 Domain 规范化写法不一致，改为规范化时刻后通过；没有放宽时刻比较或测试超时。

## 实际目标观察

只读脚本 `/tmp/market-period-reader-target-readonly.mjs` 运行宿主机编译后的新 Reader，以目标 DSA 实际日历和目标 Server 现有公开原生日线路径作为输入。请求 `600519.SH / STOCK / qfq / 1w`，可见条数 2、不请求指标；日历范围为完整 2026 年。

目标日历读取成功。日线请求返回 HTTP 500；Reader 返回 `unavailable / source_unavailable`，仅一次日历读取、一次日线请求，没有业务写入或自动重试。目标 `GET /api/market/600519.SH/chart-options?assetType=STOCK` 返回 200，none/qfq/hfq 三种口径均为 `available=false / route_not_configured`，确认目标尚未配置此日线路由。服务日志对应一次 bars 500，未将未公开的异常细节当作已知根因。

本轮没有修改策略、添加来源或再次触发失败请求。真实来源获取成功、完整覆盖、新 Server 目标部署与公开派生成功仍未验收。后续缓存实现可消费已验证 Reader 合同，不能因此关闭真实来源门禁。目标故障观察也不能替代隔离成功链路或浏览器验收。
