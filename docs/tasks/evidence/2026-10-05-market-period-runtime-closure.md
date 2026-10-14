# 行情周期完整来源与目标运行态验收

日期：2026-10-05。对应叶：T3.2b2.2、T3.3c、T3.2c3。工作区包含既有未提交修改；业务表、路由政策、AI 默认配置及账户数据未被本次探针修改。

## 来源修复与部署

月线预热真实失败来自腾讯早年度响应：精确 `sz159516`、code=0，仅 `day=[]`，不含 qfq 字段。DSA 修复保留零事实，非空错复权仍拒绝；新逐年分页协议最多 16 年段、3650 根、单段 640 根，保持总期限和逐段 SHA-256。完整规格、测试和任务由 DSA 的 `docs/specs/2026-10-05-tencent-period-window.md` 与对应 Task 拥有。

在 `thesis-ledger-infra` 执行 `./scripts/sync-code.sh dsa`，退出 0；日志 `/private/tmp/tl-all-dsa-window-sync.log`。只更新应用代码，依赖与结构输入未变，兼容性预检通过。DSA 健康，镜像仍为 `sha256:08bfe1b5a0d59d6b27c54e961a5850f603885b4686d459818897c68d3bcd250e`，修改位于可写层。宿主和目标 `tencent_native_daily.py` SHA-256 同为 `fffdf53efa0a8e08238015a2a428fd3c5671f4e7fe3583dc68a76b2ea9275f28`；后续正式镜像基线须按源码最终状态重新构建，不能把本次同步当作镜像证据。

## 验收矩阵

| 断言 | 入口与结果 | 证据边界 |
| --- | --- | --- |
| 宿主当前 Reader 取得完整日历与来源窗口 | `node --env-file=../thesis-ledger-infra/.env scripts/market-period-host-reader.mjs`，退出 0；四周期成功，非年度按完整 MA 预热计划读取原生 1d | 只复用既有凭据，不输出；实际窗口及点数见 `/private/tmp/tl-all-market-period-host-reader.json` |
| 目标公开成功、指纹、完成状态与失败参数 | `node scripts/market-period-target-smoke.mjs`，退出 0；21 项实际 HTTP 检查，2/30/90 显示窗口与四周期 bars | 独立重算公开显示聚合/点/最终摘要；每指标绑定显示摘要并保留实际计算窗口；不代表 Desktop 已实现 |
| 真实 Redis 命中及缓存损坏 | infra `node scripts/test-market-period-runtime.mjs`，退出 0；实际部署类、288 根腾讯日线、61 周计算点与 2 周显示点 | 跨缓存实例命中；仅本轮 UUID 测试命名空间写入、损坏及 finally 精确删除，不改业务缓存或停止 Redis |
| 输入、日历、时刻与跨周期变化 | 同一目标探针在实际输入副本上做受控变化，均 miss，最终摘要不同 | 实际来源与日历先读取成功；变化由探针施加，不冒称上游发生历史修订 |
| DSA 与 Redis 连接故障 | 实际 DSA 计算成功；独立测试 DSA 客户端连接到不可用端口返回 indicator_unavailable；独立 Redis 连接断开后当前事实重算成功 | 真实连接失败，没有停止共享 daemon、修改服务配置或注入模型故障 |
| 来源及传输拒绝回归 | DSA 118 项定向回归通过，关键错误 flake8 通过 | 7 项既有依赖/收集告警；日志 `/private/tmp/tl-all-tencent-window-test.log` |
| 运维入口目标边界 | `node --test scripts/test-market-period-runtime.test.mjs`，1 项通过 | 错项目、错服务、停止和不健康目标均拒绝 |

## 实际历史与降级

5d/周线两点显示各有 61 点计算；30 点显示为 89 点计算，90 点显示为 149 点计算。月线实际上市历史只有 39 个周期点：读取完整计划窗口后保留真实不足，90 点请求只返回实际 39 点，早期桶的缺日保持 unknown，没有伪造上市前价格或停牌证明。

年度两点 bars 可读，当前年度为 incomplete，尚未到期计划日线缺项保留。年度 MA 因 calendar_input_limit、MACD/RSI 因 calendar_unavailable 单独不可得；扩大年度显示窗口也按真实日历/预算拒绝。这是规格要求的能力降级，不缩短预热或以零替代未知值。

目标探针完整日志：`/private/tmp/tl-all-market-period-runtime.json`；公开矩阵：`/private/tmp/tl-all-market-period-target-smoke.json`。目标结构仍为 `20261004140000_strategy_authoring_records`。这三项叶已具备其完成条件，后续 Desktop、包级门禁、浏览器与性能仍由 T5/T6/G1/P1/R1 拥有。
