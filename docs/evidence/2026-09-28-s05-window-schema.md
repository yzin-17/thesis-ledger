# S05 历史决策窗口 Schema 局部实施证据

## 状态与权威依据

`S05-window-schema-0928 / worker_done`：本叶完成结构合约、v2 必要条件绑定、兼容回归及 Schemas 局部验证。它不代表 S05 最终历史验证、严格 PIT 来源准入或完整运行验收通过。

权威依据是主 Spec `docs/specs/2026-09-25-multi-source-adjustment-aware-backtest.md` §6、AC12/AC15；字段形状参考 `2026-09-28-s05-window-discovery.md` 的 Schema/signatures 建议。协调者明确确认旧 v1 Schema/type/binder 保留原输入和返回契约，新建联合 parser/binder 供后续 repository 消费。本叶不修改 Server 消费者、Spec 或主 Task 台账，不提交、不暂存、不清理既有工作。

基线为协调者指定的 `main / fe0e871e` 与大量未提交工作；以下哈希记录实际开始时读到的文件，不等同于干净提交：

| 开始时文件 | SHA-256 |
| --- | --- |
| `packages/schemas/src/market-pit-reconstruction-v3.ts` | `0624606b5d11bbd4edd0db3aa3401599fd2a1691a0b89ac45d69d5f9bf9a9b68` |
| `packages/schemas/test/market-pit-reconstruction-v3.test.ts` | `9d43f7022907a01c2472b97e8c03eef79a3cd13995ab9566b83398557ba682b2` |
| `packages/schemas/src/index.ts` | `5a16e314bf429418d74bc7dac389fc86a1e906b9f608d9392e9a775b635be7f0` |

## 实际变更与边界

新增 `packages/schemas/src/market-pit-historical-evidence-v1.ts` 与对应 test；修改 `market-pit-reconstruction-v3.ts` 与对应 test；`index.ts` 只新增一个历史证据模块导出，保留其余既有导出；新增本文。`backtest-data.ts`、Server、配置、依赖及锁文件未修改。Schemas build 仅产生既有忽略目录 `packages/schemas/dist` 下的可复现输出。

历史证据五组记录全部使用 strict object，拒绝未知字段、重复身份、重复引用、缺失或错误种类引用、窗口摘要冲突、制品发布集合不一致和重复文件路径。日期为真实 ISO 日期，时点须含 offset；时区须被 IANA 时区运行库识别。日期范围与逐日状态一一连续对应，不猜测周末或缺失日期；开市必须有时段、闭市必须无时段，时段有序、不重叠、不跨午夜，分钟字段与当地时间文本一致。

逐 Bar 窗口须有独立日历的完整收盘与下一有效交易日开盘，包括最后一根 Bar；声明窗口满足 `closedAt <= decisionAt < nextOpenedAt`，并拒绝声明日历/来源修订可见时点晚于决策。后继由连续日历状态反向索引得到，验证时间随日期/Bar 数线性增长；午休时段不作为下一交易日。v2 的顺序、原始时间文本、窗口身份与完整响应摘要严格对应原清单，见证仅引用原清单内归档；市场、标的和日历范围与清单一致。已获取证据、已声明来源修订和决策时刻不得晚于 `dataAsOf`；已公布的未来后继开盘可晚于该截点，无需对应价格。

上限在记录解析/日期展开前检查：外层序列化对象 32 MiB、10 万 Bar、全部日历合计 10 万日期及单日历跨度 10 万日期；每类记录最多 1024，制品文件最多 1024，单条原文 UTF-8 字节/编码文本最多 8 MiB，单日时段最多 16，标的范围最多 10000。制品 base64 编码文本限制为 8 MiB（比解码后 8 MiB 更保守）。这些限额足以容纳协调者报告的 PyPI metadata 28845 字节与 93 个源码文件、总计 695008 字节。实际部署文件的原始 UTF-8 字节上限仍须由 repository 在读取时执行；对象 Schema 无法代表输入原文中的额外空白、BOM 或字段顺序。

结构 Schema 可以表示三种证据种类及 parserVersion，不登记、不执行 parser，不验证 SHA-256 与原文一致、不验证发行材料真实性、标的交易所关系、时区/DST 的唯一映射或真实来源捕获。缺这些核验时不得据结构成功授予历史资格。现有 `market-pit-proof-v1:<sha256>` 引用外壳不变，本叶未改该引用协议。

## 新增公开 API

通过 `packages/schemas/src/index.ts` 导出：

- `marketPitHistoricalDecisionWindowV3Schema`、`HistoricalDecisionWindowV3`。
- `marketPitReconstructionProofV2Schema`、`MarketPitReconstructionProofV2`。
- `marketPitReconstructionManifestV3Schema`、`MarketPitReconstructionManifestV3`：明确 v1/v2 联合解析。
- `bindMarketPitReconstructionManifestV3`、`MarketPitReconstructionManifestBindingV3`：仍只返回 `bound` 或 `unavailable`；v2 的 `decisionAt` 必须等于原输入 Bar 未修改的 `availableAt`（同一时点比较）。
- `marketPitEvidenceWithinLimits`、`boundMarketPitEvidenceStructureV3`：有界对象检查与 Schema 预处理。
- `MARKET_PIT_RECONSTRUCTION_MAX_BYTES`、`MARKET_PIT_HISTORICAL_MAX_DATES`、`MARKET_PIT_HISTORICAL_MAX_BARS`、`MARKET_PIT_HISTORICAL_MAX_RECORDS`、`MARKET_PIT_HISTORICAL_MAX_RAW_BYTES`。

旧 `marketPitReconstructionProofV3Schema`、`MarketPitReconstructionProofV3` 与 `bindMarketPitReconstructionProofV3` 仍为 v1，原客户端输入/返回类型不变；旧 parser 继续拒绝 v2。联合 binder 复用旧必要条件，再返回原 v2，既有 `bound`/`archives-bound` 不升级为最终成功状态。

## 最终检查

最后源码修改和格式化之后执行，均通过；没有确定性失败或重试：

| 检查 | 结果与范围 |
| --- | --- |
| `pnpm --filter @thesis-ledger/schemas exec vitest run test/market-pit-historical-evidence-v1.test.ts test/market-pit-reconstruction-v3.test.ts` | 2 文件、65 测试通过（26 + 39）；结构错误、重复/交叉引用、连续日期、时段、后继、horizon、限额、v1 兼容、v2 原始归档与输入时点绑定 |
| `pnpm --filter @thesis-ledger/schemas typecheck` | 通过；Schemas 源码与新增导出 |
| `pnpm --filter @thesis-ledger/schemas build` | 通过；已生成稳定 dist 导出供下游消费 |
| 拥有文件的 Prettier 与 `git diff --check` | 通过；没有广泛格式化 |

自审：保存所有既有工作；新结构模块与重建模块均低于 600 行；无新增平行价格 DTO 或历史资格状态；后继查询避免逐 Bar 反复扫描日历；不调用网络、Provider、数据库、Docker 或浏览器。全仓库检查、真实发行材料 parser、真实归档绑定、冻结/离线重验、实际执行日历比较及目标运行态验收未执行，仍由后续独立叶子/门禁负责。

## 最终源码身份

| 文件 | SHA-256 |
| --- | --- |
| `packages/schemas/src/market-pit-historical-evidence-v1.ts` | `f4a7dceb0a0e8c183f8a48122aa2138b79e20d76f650ef3be5e0475d2153943b` |
| `packages/schemas/test/market-pit-historical-evidence-v1.test.ts` | `f37dc1ab61ab4596780f86526212145aac7e80b0f3b99be647c1c16343e23a33` |
| `packages/schemas/src/market-pit-reconstruction-v3.ts` | `4bec6991ce80445d676332aa399bee43e4ab8bed5eb3813c0d0e385a6770ede8` |
| `packages/schemas/test/market-pit-reconstruction-v3.test.ts` | `e60112a2fa836ac57c1b4345ad4cd917b514638432a884c70224affb5d61de61` |
| `packages/schemas/src/index.ts` | `d64c164fb5afadecfba89cb17945a871f6256aeadcd0af5e2dcd3469efc5da01` |
