# U05 结果披露补验

Desktop `optimization-research-disclosure.test.tsx` 4 项、`backtest-model-disclosure.test.tsx` 5 项、`backtest-preparation.test.tsx` 9 项，共 18 项通过。

源码 `BacktestPriceDisclosure` 严格解析 V3 结果，展示实际 actualSources 的 Provider/upstreamSource/主备索引，不将配置主源当作实际命中；展示价格口径、记账单位、历史性质、分红语义、观测时刻、基准兼容性/成本及引擎和快照重放版本。未知基准或成本保持未知，损坏协议显示无法读取。模型披露组件保留冻结状态、来源、适用区间与假设，未替换原有结果指标。

通过测试覆盖实际备用来源、provider-defined 分红、未知成本、损坏协议、旧响应/失败诊断，以及固定快照下封存测试不构成无前视的说明。准备测试另覆盖输入/关闭后的晚到响应、配置及修订失效和请求身份匹配。

此证据仅为本地静态渲染及受控查询测试，没有执行目标浏览器或 Electron；不同评价组及全部基准状态的展示覆盖仍需继续核对。U05 保持开放，C03/B05 已完成不自动关闭消费端验收。本轮无界面或生产代码改动，无真实模型调用。

后续补充：新增 incompatible/unverified 两项严格结果渲染回归，分别断言不计算可比超额收益/不进入同一评价组，且不出现兼容收益声明；两者均保留 snapshot-manifest-v3 重放版本。`backtest-preparation.test.tsx` 更新后 11 项通过。仅增加测试，不改变组件；完整目标展示与实际评价组交互继续开放。
