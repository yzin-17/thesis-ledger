# I01 完整响应 JSONB 摘要失配只读调查

## 结论与边界

状态：`needs_split`。现有证据可以定位到完整响应持久化往返，但不足以证明具体字段或运行时序列化步骤发生了变化。当前源码不能支持“JSONB 重排键导致失配”的修复结论；本轮没有修改摘要算法或放宽完整性校验，I01-reader-pg 与 I01 父项继续开放。

本轮只读取已有失败记录、保留复现的源码、Market 摘要/Reader/证据仓库、稳定响应 Schema 与已安装对象解析实现，写入本文件。未执行测试、复现、数据库查询、Provider/网络、build、部署，也未重置首次加两次重试的预算；未读取凭据文件或业务原文。当前 PIT 日历结构/时区在写文件与新窗口草稿不作为调查输入。工作树存在大量既有 WIP，未撤销、提交或整理。

## 已有事实与准确复现位置

- 权威任务：`docs/tasks/2026-09-25-multi-source-adjustment-aware-backtest.md:418`。
- 原失败记录：`docs/tasks/evidence/2026-09-27-worker-runtime-integration.md:57-70`。首次和两次重试均在第二条相同窗口创建时失败；来源价格事实、覆盖证明和输入完整响应摘要一致，数据库回读完整响应重新计算的摘要不一致。
- 保留复现：`apps/server/test/backtest/v3-worker-runtime.integration.test.ts:24-28`，仅同时设置两个隔离环境开关才启用；第二次创建在 `167-181`，独立 Worker 启动在 `184`，因此本卡点发生在 Worker 启动之前。
- 实际 Reader/仓库接线及诊断：`apps/server/test/backtest/worker-dsa-http-fixture.ts:105-140`。`114-120` 仅输出四个布尔比较，并且遍历所有行；没有保留精确身份对应行的字段路径差异、类型差异或数值位模式。原记录没有逐字段往返样本，原隔离容器也已清理。

这些事实只证明持久化回读后的完整摘要不符合所存摘要，不能推出具体哪一个 Bar 数值、时间文本、缺字段或解析步骤发生变化。

## 摘要生成与冻结回读链

| 接缝 | 当前实现及静态证据 | 含义 |
| --- | --- | --- |
| 受控响应 | `worker-dsa-http-fixture.ts:75-83,92` 调用 `makeReaderResult`，替换请求关联 ID，再以 JSON 输出 | 样本是单窗口响应，没有 `windowObservations` |
| 样本构造 | `v3-snapshot-fixtures.ts:58-113` 从 Schema fixture 构造 Bar、覆盖与来源事实，再解析 | `close = 1 + index / 1000`；OHLC 和 amount 经浮点运算产生，时间为 ISO 字符串。计算表达式是已知输入，但回读值未知 |
| 在线获取 | `dsa.client.ts:397-400`、`dsa-v3-protocol.ts:160-172` 验证响应与固定请求 | 不把后续数据库事实列回填进响应 |
| 精确来源选择 | `market-bar-reader-v3.ts:132-164` 固定 target，计算 seriesVersion，传递 `selection.response` 至证据仓库 | 选择后的完整响应成为冻结输入 |
| 写入 | `market-window-evidence-v3.repository.ts:274-300,194-224` 先解析响应，再将同一 `response` 同时交给 `completeResponse` 与摘要 helper | 完整摘要不是对另外一个部分投影或 Date 转换结果生成 |
| 单窗口摘要 | `market-frozen-window-v3.ts:18-22` 再次严格解析响应，只把 requestId 固定为既有传输关联常量，随后 SHA-256(JSON.stringify) | 完整响应全部合同字段参与；本轮不改变既有 requestId 语义 |
| JSONB 存储 | `20260926090000_market_window_frozen_response/migration.sql:3-14` 定义 JSONB 与摘要字符列 | SQL 约束不计算或重写摘要，也没有日期列回填逻辑 |
| 重复创建 | `market-window-evidence-v3.repository.ts:307-331` 查精确身份，先比较事实，再比较输入摘要与已存摘要，并重新摘要 `existing.completeResponse` | 已有诊断对应最后一个完整性条件；失配时拒绝覆盖 |
| 冻结回读 | 同文件 `342-353` 对 `row.completeResponse` 先校验摘要，再从该 JSON 解析 response | 不是从独立 Bar 表或事实行重组响应 |
| 日期/事实列 | 同文件 `354-391` 用日期列重建 request.start/end；事实列仅与 response 做严格比较 | 没有替换 response 的 timestamp、availableAt、observedAt 或 knownAt；fetchedAt 属于证据元数据 |
| Run 创建 | `backtest-v3-run-lifecycle.ts:249-258` 先 buildV3，再验证冻结 manifest | 摘要失配在创建/冻结阶段；当前失败不能归因于 Worker 晚到结果 |

当前磁盘 `apps/server/dist/src/market/market-frozen-window-v3.js:12-16` 也保留相同单窗口摘要表达式。此项只是静态读盘核对，不能证明 2026-09-27 失败时所有运行产物、依赖与今日完全一致。

## 已排除与未证实的假设

| 假设 | 判断 | 依据与限制 |
| --- | --- | --- |
| JSONB 改变顶层或嵌套对象键顺序 | 当前单窗口实现不支持此原因 | `market-data-wire-v3.ts:160-173` 顶层 strict shape；routeKey、Bar、coverage、coverageProof、sourcePriceBasis、provenance 的所有对象均固定 shape。该响应子树没有动态 record 或任意对象。安装 Zod 4.4.3 的 `v4/core/schemas.js:743-755,845-857,881-910` 在普通和 JIT 路径均按 shape.keys 创建对象；hash 在两端重新解析。仅重排输入对象键不足以改变当前解析后的顺序。此排除不证明历史依赖一致 |
| 默认字段补全 | 当前完整响应 Schema 无此不对称 | Bar 字段必填；响应及其嵌套 Schema 没有 default/catch/coerce。sourcePriceBasis.fieldUnits 为 optional，缺失保持缺失，不应补造 |
| ISO 文本经 Date 自动标准化 | 当前 hash/仓库链无此步骤 | Bar 时间用 `z.iso.datetime` 字符串校验，来源时间同样是字符串；hash 只解析并 stringify。仓库 dateOnly/toDate 用于身份请求日期，不用于完整响应内容 |
| 日期列精度或事实行覆盖原响应 | 当前失配位置可以排除 | 重复创建 `329` 与 findFrozen `349` 都直接摘要 JSON；日期列重建与事实比对在后续，没有回填 Bar/来源时间 |
| Decimal 对象或特殊 JSON 值 | 当前合同没有该输入 | `market-bar-series-v2.ts:14-24` 数值字段为 finite number，时间为 string；sourcePriceBasis 与 coverageProof 也只包含固定 JSON 原语。PrismaService 没有自定义 JSON middleware（`prisma.service.ts:6-44`）。这不证明 Prisma 引擎内部的数值解析无损 |
| requestId 随第二次请求改变 | 当前 helper 已固定该字段 | 单窗口 helper 第 20 行归一到同一既有常量，原记录也确认本次输入摘要与保存值一致 |
| 浮点数在 Prisma/JSONB 传输往返变化 | 尚未证实 | 样本存在浮点算术；但已有证据未给出任何回读数值、位模式或原始规范 JSON 差异。不能据此改用舍入、容差或数值删减 |
| 历史运行产物/Schema 差异 | 尚未证实 | 当前磁盘 helper 与源码一致，原证据未保存失败时全部输入源码/依赖/产物指纹；没有足够信息复原那个环境 |
| 缺字段、类型变化、数组变化 | 尚未证实 | 原布尔诊断没有完整响应 deep compare、首个差异路径或数组长度。不能把 sourcePriceBasis/coverageProof 独立列一致当作完整 JSON 子树已一致 |

## 已有规范化能力及所有权

先检查已有实现，未新增通用工具。Market 中 `market-window-selector-v3.ts:325-335` 的私有 canonicalJson 与 `market/instruments/catalog-checksum.ts:4-12` 的私有 stableJson 可消除对象键顺序差异，但当前原因未证明为键顺序，二者也不是完整冻结响应摘要合同，不应机械替换。

`canonicalBarSeriesEncoding`（`market-bar-series-v2.ts:56-75`）只编码序列身份与 Bar；`canonicalMarketCoverageProofEncodingV3`（`market-coverage-proof-v3.ts:123-144`）只编码覆盖证明，均不能替代完整响应摘要。`canonicalMarketMultiWindowEncodingV3`（`market-multi-window-encoding-v3.ts:18-26`）属于多窗口内容协议，除 requestId 外还替换 inputFingerprint 和来源 revision；直接用于单窗口会改变现有内容身份，不能作为本问题修复。Market 冻结摘要应继续由 Market domain 拥有，上游 DSA adapter 或无所有权 shared/utils 不是修复落点。

## 下一最小调查叶

不提出源码修复叶。建议仅拆出 `I01-jsonb-field-diff-instrumentation`：准备精确身份行的脱敏结构诊断，不启动原 Worker 组合门禁、不执行数据库、不修改摘要算法。

该准备叶的独占写入集合仅为：

1. `apps/server/test/backtest/worker-dsa-http-fixture.ts`：将泛行布尔诊断约束到本次精确身份，记录原完整响应与回读响应在 Schema 解析前后的差异字段路径、类型、字段存在性、数组长度、首个 JSON 字节差异位置；数值只记录合成样本允许的 IEEE-754 位模式差异，不输出业务原文、凭据或完整 JSON。
2. `docs/tasks/evidence/2026-09-28-i01-jsonb-field-diff-instrumentation.md`：记录诊断输入边界与执行授权状态。

准备代码本身不是失配的新因果证据，也不授予新测试预算。需要采集新往返数据时，由父任务另行明确最小、独立的合成 JSONB 往返调查与预算，并先确认运行产物和 Schema/依赖指纹；不能用“加了日志”自动恢复原首次加两次已耗尽的 Worker 门禁。优先只取一条完整合成响应的一次写入/一次精确回读，分别保存写入前和回读后 Schema 解析输入的脱敏差异，避免再次跑整个创建/队列/Worker 生命周期。是否允许该新调查不由本轮推定。

只有定位实际差异字段和发生层后才可规划最多一个修复叶。届时必须保留所有必填字段、严格 Schema 与篡改失败门禁；不得舍弃字段、四舍五入掩盖真实差异、补造未知时间或降低完整摘要为部分摘要。若摘要合同必须升级，需显式版本区分和经过验证的旧摘要读取策略；不能对未知/失配旧记录无条件接受新算法，也不能在读取时重新摘要并覆盖历史 finalized 内容、引用或身份。本轮没有足够因果依据选择兼容方案或新增版本字段。

## 静态检查

本文件是唯一写入。执行范围为只读路径/行号核对、文档空白检查；未运行仓库门禁或测试。当前无实现修复、无运行态通过证据，`I01-reader-pg` 未通过。
