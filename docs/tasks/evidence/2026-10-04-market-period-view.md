# 行情周期纯装配证据

对应 [Task](../2026-09-16-market-chart-period-aggregation.md) 的 T3.2b1。当前只完成原生日线到显示/计算视图的纯装配；实际基础窗口读取、缓存、公开派生成功响应与 Desktop 验收仍开放。

## 实现与边界

`market-period-source.ts` 校验现行 CN STOCK/ETF 日线合同、原始点摘要、完整价格口径和采集上下文；来源身份、采集摘要及完整口径进入基础摘要。原生 Bar/Route/Data 周期保持 1m/1d。派生 Schema 的资产范围收敛为 STOCK/ETF，五项反例确认原生资产枚举仍保持兼容。

`market-period-view.ts` 复用完整桶规划和 Domain 聚合，显示子集与预热计算输入分别生成聚合上下文、点摘要及最终指标输入指纹。缺日没有可信解释时保留 unknown；空输入不补点，分页同时核验实际来源覆盖与计划桶。派生 availableAt 覆盖原日线、完整口径观测/读取与日历依据，精确比较并保留微秒，不因 Date 毫秒精度而提前宣称事实可用。

SHA256 属于此协议的内容摘要。已检查实际 es-toolkit 依赖和导出，没有对应密码摘要算法；使用 Node crypto，不增加工具库依赖，不改指标公式。

## 本地验证

- `pnpm --filter @thesis-ledger/server exec vitest run test/market/market-period-view.test.ts`：22 项通过，覆盖四周期、独立 OHLCV/金额预期、显示/预热绑定、口径/来源/日历/时刻变化、缺日/空态、分页与拒绝路径。
- `pnpm --filter @thesis-ledger/server exec vitest run test/market test/integration/dsa-market-calendar.test.ts test/integration/dsa-period-indicators.test.ts test/integration/dsa.client.test.ts`：57 文件、706 项通过；5 文件、27 项按既有条件跳过。
- Schema 全包 640 项、API Client 全包 68 项通过；Server 与 Desktop 类型检查、Server build 通过。新增及受影响代码定向 ESLint/复杂度上限 20、Import boundaries 与 `git diff --check` 通过。
- Domain 386 项与共享 golden 字节一致性复用 T3.2a 的有效证据：本叶没有改变 Domain 算法或夹具输入。未重复运行数据库、原生客户端或全仓高成本检查。

## 目标计算验证

临时只读脚本 `/tmp/market-period-view-cross-runtime.mjs` 以宿主机新装配代码生成受控输入，再向现有目标 DSA 发送四周期计算请求。5d/1w/1mo 各 61 个计算点，1y 为实际可用的 9 个计算点；响应及每个指标输入指纹与请求一致，MA5 与最后五个 close 的独立算术均值一致。四例保留 `2026-10-03T00:00:00.000321Z` 依据时刻。

该验证没有调用 Provider 或写业务数据。宿主机执行新 Server 装配，目标只执行已同步的 DSA 计算合同；新 Server 装配未部署，公开派生请求仍结构化拒绝。它不能代替真实日线获取、目标 Server 成功链路、历史覆盖或浏览器验收。脚本首次遇到 tsx 配置及输出读取问题，改用显式 `TSX_TSCONFIG_PATH` 和受控 JSON 行后四例通过，没有修改业务配置。

## 保留工作

缓存接入前新增微秒评估边界回归：Server 装配保留显式 evaluationAsOf 的原始精度，避免 Domain 的毫秒规范化使响应评估时刻早于同毫秒内的必要依据。晚一微秒的评估改变指纹，早一微秒明确拒绝。装配最终 23 项，读取编排/装配/窗口三个文件共 52 项通过；Domain 算法与 shared golden 未改。

T3.2b2 负责真实完整基础窗口、事实获取后固定评估时刻、跨窗口变化处理及结构化降级；T3.2c 负责缓存与指标投影；T3.3 后才开放公开成功响应。T3/T5/T6/G1/P1/R1 继续未勾选。
