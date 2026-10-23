# 基金分钟复权口径修复与目标验收

对应[Spec](../../specs/2026-10-21-fund-adjusted-returns.md)及[Task](../2026-10-21-fund-adjusted-returns.md)，从原 R3.I11 接续。此处先记录已完成的代码、复权来源、当前点与 Web，跨日误差测量另按 Task P6 接续。

## 错误复现与修复

原代码用原价 Quote 除以不复权锚价。合法 V3 输入下，拆股把基金市值 100 错算为 50，分红错算为 90；Provider 坐标缩放和非零收益同样错误。原 16 项失败保留在 `fund-adjusted-before-valid-contract.log`，不是由合同输入错误或解析失败制造的通过。

新 helper 按报价实际市场时刻和 CN/HK/US 日历确定对应交易日，用同一份 qfq 序列的精确 NAV 锚日与报价交易日价格计算收益。原价 Quote 用于判断当前价格可用和定位交易日，不与复权锚价混算，不从 OHLC 数值伪造转换证据。序列 sourcePriceBasis 仍保留 `provider-defined`、`conversionAvailable=false` 等原语义。

原 NAV/披露保护、零权重跳过、原权重不归一及缺价持平保持。缺日期、未知/未来时刻、错误证券/口径、零价格或未覆盖日历均不计入定价覆盖；新增分钟价格证据保留两点价格、日期、fingerprint、完成状态及原价格口径。Provider qfq 日线收盘的更新频率构成估算的实际精度边界，未冒充比来源更快的实时复权 Quote。

## 本地验证

- 新增 21 项，涵盖分红、拆股、全局缩放、非零收益、零价、身份/口径、缺日期、未来数据、盘前/周末/国庆/未知年份及上海偏移日期。
- 四文件 42 项定向通过；收益模块 92 项通过，21 项按既有独立数据库条件跳过。原数据库结构、正式校准及 DSA/Schema 输入未变，复用其已过证据，没有重复跑来源 SDK。
- Server 类型、构建、定向 ESLint、源码边界、工作区复杂度与尺寸门禁及选定文件 Prettier 通过；尺寸有 8 项既有警告，没有改阈值。维护来源复用、原响应完整性、无路由写入权和故障恢复共 17 项 Node 检查通过。
- 主要输入：`performance-fund-adjusted-return.ts`、`performance-valuation-series.service.ts` 和两个基金测试；维护入口为 `scripts/fund-disclosure-acceptance.mjs` 及其 guards/runtime/tests。

## 正式同步与保护

正式 `sync-code.sh thesis-ledger` 更新 Server/Worker。首次同步后，宿主格式整理改变编译摘要；首次核对不一致记录保留，再通过同一正式入口同步最终稳定输入，未绕过门禁。最终两个容器实际四个模块摘要与宿主构建一致，盘前日期与未知年份拒绝分支实际加载验证通过。

同步前后保护文件 SHA-256 均为 `1335cc2f7024f46853199a7b19948a396d2974f9958dcf07bac9ed4bce33d0fc`；加载证明为 `b88ba6aca475cf12a81f5b4139acc69c9e72ca59a7baa6494ca54eb21de82db4`，最终同步日志为 `bf69480c6b91a66c42c24ed8f1667635cf4168288691347d37e850a2f591b4ed`。

原 13 张表、57 个 V3 结果、四个旧分钟点、资产/目录/来源/政策 160 和模型计数保持。镜像 ID 不变；本次属于容器可写层代码同步，不是镜像发布。

## 真实复权价格与当前点

冻结计划 `.recovery-artifacts/fund-adjusted-20261021-plan.json`，SHA-256 `c753abeff5839b94c5fb6d586c2446618a087392e0ff54188d9a355b11413a0f`。新案例 `36449592-48c1-4314-a479-8ca7301dfd0d` 按完整回执摘要复用[已合格来源](2026-10-21-fund-disclosure-acceptance.md)的 NAV/74 项披露原响应，观察时刻与来源标记不改；没有重新请求基金来源或写路由。

20 项正权重各读取一次实际报价和 qfq 日线，20 项均通过实际编译 helper 的证券、口径、精确日期及来源时钟核对；54 项零权重不请求。所有价格口径为 `qfq/provider-native`，报价所属交易日为 2026-10-20，来源及指纹随点位 evidence 留存。例：`600519.SH` 两点 qfq 均为 1331.88，fingerprint 为 `7b3518bfce3151f37f737b532e40f54b0819a22328d539e8fb6f27f8f2c247a4`。

专用账户 `dcf52295-7450-4c1d-a763-08603c1bff3f`，`fund/actual/CNY`，正常入金 1000、买入 100 × 1.25。真实当前维护分钟 `5/6` 分别为 `2026-10-20T19:00:00Z`、`19:01:00Z`；NAV 0.5406、现金 875，总值均为 929.06，披露及定价覆盖 94.77%，质量完整。报价对应日与锚日相同，本例零变动；不代表跨日误差或现场开市调度，旧原价点没有被改写成新算法结果。

Web 实际范围选本次账户、1 日/分线，展开明细显示 03:00/03:01、929.06、估算、94.77% 和完整。恢复原近一年/日线、模拟账户、成交页和系统浅色后，维护入口正常卖出、取回现金并可恢复停用；四条新审计与两点保留。原十账户/四旧点及原业务严格保护通过，最终 `phase=passed`，基金 GET/路由写入/模型请求均为零；本次报价 Server→DSA GET 为 20，qfq 日线 Server GET 为 20，不与 SDK 内部次数混称。

完整回执及图片在 `.recovery-artifacts/fund-disclosure-20261021-36449592/`。最终回执 SHA-256 `faee0f14fa00af610a5cff273c2e122dc35b84683c2d23733a4c391a4dd56138`；Web 图片 `35e5dd598a94f1adf2752415bcbefddcc2e9594b79bdde0f97db08a2b9c5a02b`，原页面恢复图 `ac341944c6f2e119cfe8083adaed7a342a5a410adfd8f274a7ea8018d98c3f89`。
