# 摘牌历史数据 L3-V 真实消费验收

日期：2026-10-31。所属 [Task](../archive/tasks/2026-10-09-history-data-on-demand.md) 和 [Spec](../specs/2026-10-09-history-data-on-demand.md) 继续拥有状态及验收合同。

## 当前核对

用户已明确要求完成 L3-V，接续指令已收到。原 Task 保留“不改主备、凭据及准入”和停止扩搜边界；本次完成指令不被解释为默认选择此前未获确认的整窗备用单源新协议。

2026-10-31 22:09（北京时间）读取目标政策和精确目录，主仓/DSA 均为 revision 175、applied。CN/STOCK/DAILY_BAR/1d/qfq 和 none 仍为 HiThink 主源、腾讯备用；股票生命周期仍使用已选 BaoStock 路径。DSA 保存的 routes_json SHA-256 为 `0c5a7f624361463d945711a0150ec2f810a1f08c8cde8faa94eebd382b57d7cb`。腾讯 qfq 目录项为 ready，查询语义为 `single-target-whole-window`、`per-request`；目录就绪不证明当前样本覆盖。

现行 Server 的 `supportsBasicPriceFallback()` 仍排除 CN 股票；[来源合同](../specs/2026-10-09-unified-data-capability-source-contracts.md)也明确保留 CN 股票备用限制。原 600112 的历史 HiThink 失败及腾讯缺兼容 proof/observation 证据继续按原时点理解，本轮未重新请求这些来源。

以只读 PostgreSQL 事务核对已指定的 600112.SH、600122.SH、600139.SH、000005.SZ 和已有旧正例 600462.SH 的窗口证据，只有 600462 的腾讯 none 输入：2025-06-24～2025-07-22、routeIndex 0、政策20，指纹 `bc5995fef3985c0b088e2ae6c4f68c956c87277f556744e9eed9b05fe3b146ab`。其旧运行 `b049cd97-5404-49c2-85a8-c1de695afc65` 使用 `frozen-trading-status-v3`，没有 `lifecyclePreparation`；它不能替代本次正常准备产生的新生命周期快照。查询范围之外未作全库无数据推断。

上述执行前核对阶段未修改产品代码、数据库、路由、凭据、准入或容器；该阶段真实来源数据读取、真实模型调用和费用均为0。旧普通窗口、跨上市、诊断下载及重放证据未重跑。

## 已授权的最小执行方案

用户已明确回复“授权临时切源并恢复”，本节范围获准执行。目标为原样本 `600112.SH`、请求区间2024-04-01～2024-08-23，`listed-bars-warmup-v1`、MA5及原预热5；采集窗口仍由现有准备逻辑计算，不手填价格、日期或来源 JSON。

| 项目 | 精确范围 |
| --- | --- |
| 临时变更 | 只将 CN/STOCK/DAILY_BAR/1d/qfq 的 `[HiThink, 腾讯]` 换为 `[腾讯, HiThink]`，其余19条路由和启停保持 |
| 并发保护 | 以政策175为读取基线，正式维护 API 使用 expectedRevision；变更前重新比较实质字段。草稿预期175→176→177；若并发变化，不直接重放旧草稿 |
| 预算 | 真实模型0次；标准数据能力读取总上限12次，腾讯/BaoStock各最多6次，沿现有适配器单标/窗口预算；费用上限0，无额外探针、证券扩搜或失败重试 |
| 新增数据 | 仅本次策略/版本、准备、新BacktestJob、冻结输入/结果及必要读取审计和本地验收证据；不改旧数据或真实账户 |
| 验收链路 | 正常 prepare/create → 新快照 → Worker持久终态 → 生命周期及价格消费核对 → Web页面与实际诊断下载 → 新旧离线重放 |
| 失败与恢复 | 任一来源/身份/覆盖/准备/运行失败即停止后续验收，仍执行有条件恢复；只有当前实质政策仍等于本次临时政策时才CAS恢复原顺序，并核对两端applied。并发冲突时不覆盖他人修改 |

该方案通过明确选择现有腾讯为本轮主源取得固定来源输入，不签发跨源等价证明，不降低兼容检查，也不实施新的备用研究协议。任务仍须以新快照完整链路通过后才勾选。

## 机器证据

本轮本地目录：`.recovery-artifacts/history-demand-l3v-20261031T140948Z/`。

- `policy-before.json`、`catalog-readonly.json`：目标只读政策及目录。
- `policy-apply-draft.json`、`policy-restore-draft.json`：授权前准备的精确请求，经实质基线和CAS复核后执行；实际回执保存于 `policy-applied.json`、`policy-restored.json`。
- `next-scope.json`：样本、预算、保护范围、失败停止和完成条件。
- `git-baseline.json`：三仓HEAD、index摘要和dirty基线，分别1458/934/124，暂存项均为0；不清理或覆盖在途工作。

现有历史摘牌诊断、跨上市新快照及手动下载证据见[完整历史](../archive/tasks/2026-10-09-history-data-on-demand-history.md#l3-后续下载核对与摘牌诊断叶)。它们作为对应层证据复用，不上调为本项通过。

## 实际执行与结果

用户明确授权本方案后，串行经正式政策 API 生效和恢复。北京时间22:16:11临时政策176/applied生效；22:16:16目标Worker完成；22:16:17已恢复原20条路由，两端177/applied。恢复后的DSA路由原文SHA-256仍为 `0c5a7f624361463d945711a0150ec2f810a1f08c8cde8faa94eebd382b57d7cb`，与执行前相同。没有来源失败或实源重试。

| 产物 | 实际身份与结果 |
| --- | --- |
| 新策略/版本 | `88894aa3-02c3-43d8-921d-07a673424799` / `cdcb774b-3ea8-4f7f-a336-a2579eebfe97` |
| 新运行 | `f1c53b62-d2f2-4c72-b1f9-d3327e9591ea`，持久终态succeeded，14笔成交、无拒绝订单 |
| 新快照 | `07891b52442df50b4df42cecad9a7a3f9fdf7eb49d448384f1041dc71d1735a7` |
| 结果校验和 | `6b7232301a933c8e`，引擎 `thesis-ledger-v3-local-runner-v3` |
| 原请求与预热 | 2024-04-01～2024-08-23、MA5、原需5根真实Bar；实际信号起点2024-04-01，未缩短请求 |
| 实际价格输入 | 腾讯qfq主源、routeIndex0、政策176；89根Bar，实际价格日期2024-03-08～2024-07-19。执行、信号和基准使用同一输入指纹 `92cf8a0d2e208adbfea8ae06a943db9d30585323d33044510156576ec4548751` |
| 生命周期与状态 | BaoStock `query_stock_basic`确认ipoDate1997-11-27、outDate2024-08-15，状态为known；冻结 `frozen-trading-status-v5`，保留逐日响应与真实观察时钟 |
| 预热绑定 | `listed-bars-warmup-v1`，inputHash `e8cd796e728b20a8b478d1021769bd66f49614a58e51d72d119be4e3fca5e334`，priceResponseHash `5f25d232bd4e38aeb040009b18d000e59098114557b157806a2925485f0d03f3` |

来源明确标记2024-07-22、08-14为停牌；摘牌日起没有成交，未补造缺失报价。价格末行07-19不证明最后交易日。来源仍披露6个交易日的交易状态/ST未知、量基准未知；本次结果的计算完整性不扩大为全部历史事实完整。特殊制度、整理期规则、历史首次可见性和摘牌后价值没有因本次验收变为已证明。

按目标DSA本次执行窗口日志，腾讯价格标准读取1次、BaoStock状态标准读取6次，另有本地身份读取1次，总计8次；每源及总预算均未超限。上述是标准能力入口计数，不冒充底层HTTP/SDK调用次数或完整账单。没有真实模型或付费接口调用，费用预算0；独立复算的CNY140.79是策略模型内的**模拟交易费用**。

## 页面、实际下载与独立复算

使用当前Desktop源码Vite和实际目标Server/Worker结果，在独立Edge浏览器上下文打开新运行详情。结果、数据与假设、诊断与复现页签均实际展示；页面明确列出腾讯执行/信号/基准、BaoStock来源、原请求区间、预热5、生命周期日期和未知覆盖。浏览器只允许本机GET读取，无写请求、无新增来源请求、无页面错误；验收后已关闭本次自建Vite进程及浏览器。

实际点击“导出诊断 JSON”，取得 `backtest-f1c53b62-d2f2-4c72-b1f9-d3327e9591ea-diagnostics-v2.json`，46131字节，SHA-256 `6ce463d2f29b4c088fe00d2b84fc91ef44b32f0233e412b9a49e492114afb70e`，下载failure=null。逐字段核对run/snapshot/checksum、引擎、原区间、生命周期选择及两类输入哈希、基础日期、来源摘要/观察时钟、逐日状态、结果指标/基准和全部警告均匹配实际冻结输入。诊断摘要仍不是完整复现包；离线验收直接使用真实快照产物。

本机独立Decimal核对14笔成交均采用对应实际Bar开盘价，符合冻结交易状态及生命周期范围；逐项佣金、印花税和过户费按显式研究模型核对。期末份额0、现金/净值 `99253.772038371318043197048580283648214947881696 CNY` 与持久结果一致；摘牌日起成交数0。脚本不重新请求来源或复用Runner来计算这项独立现金核对。

## 离线与旧数据边界

新运行经已有只读 `scripts/research-window-replay-target.mjs` 在目标Worker中以相同v3引擎连续执行两次，完整结果相同且校验和匹配持久结果；fetch/http/https/net/tls均阻断，网络计数0。

原跨上市运行 `1ec5077b-5f3c-4a01-b827-b1953c477ae5` 的v2验收按原相同引擎条件复用。本轮额外将它交给当前v3脚本比较旧校验和时失败，该比较不满足[统一回测Spec AC11](../specs/2026-08-28-unified-backtest-v2.md)的相同引擎前提，因此不作为通过证据，也不据此重写旧结果或承诺跨引擎校验和相同。随后仅只读核对旧快照身份 `2a2f1193e469636399a236bec2072a2ec5a54c08d370bcebe744f1d03d316d78` 及10个产物的内容哈希、字节数与Parquet读取完整性，均通过；不再执行旧Runner。

保留的本机校验修正记录：首次浏览器等待networkidle因现有事件长连接超时，改为以实际详情页签可见判定后通过；诊断校验初稿误把白名单摘要当完整冻结对象、忽略指标缺省null，已按现行公开字段合同逐值核对；旧产物检查初稿错误读取不存在的rowCount，按ArtifactRef实际的哈希/字节数合同修正。原失败日志及脚本保留，以上均未引出来源重试、产品代码/合同修改或新的模型调用。

## 最终保护与评审

前后重复只读核对得到：598条既有策略、版本、回测、AI、优化及风险记录均未变化；41张汇总表中38张摘要相同，仅本次Strategy/StrategyVersion/BacktestJob各新增1条。AI配置完整摘要保持，DSA九份来源配置、九条准入和原证据文件摘要相同；DSA政策175及以前的历史记录完整摘要保持。全部20条路由已恢复，只有授权政策新修订176/177及本次所属运行/冻结/读取产物新增；未写真实账户域。

| 原验收条件 | 最终结论 |
| --- | --- |
| AC1 | 通过；原600112窗口沿正常准备/创建，无手工来源JSON；实际选择、来源指纹和冻结政策可追溯 |
| AC3 | 通过；真实基础资料、独立日状态与生命周期冻结；摘牌日不解释为最后交易日，未知规则仍披露 |
| AC5 | 通过；腾讯/BaoStock实际标准响应经新快照、目标Worker、页面和实际下载消费，14笔成交另有独立核对 |
| AC6 | 通过；新快照同引擎两次断网结果一致；旧记录和10个旧产物保持，旧同引擎证据复用，跨引擎额外比较未计通过 |

当前L3-V及其原L3父条件完成，原Task归档；未恢复已取消能力，未转移未完成项到TODO。无产品代码变化，未重跑未变输入的包级/边界或构建，未执行Docker状态变更；真实运行、页面/下载、离线及数据保护分别由本轮证据承担。

机器证据增量：`target.stdout.json`、`execution-events.jsonl`、`policy-applied.json`、`policy-restored.json`、`dsa-read-window.log`、`new-run-replay.json`、`old-artifact-integrity.json`、`browser-proof.json`、`web-*.png`、实际诊断文件、`consumption-and-download-verification.json` 和 `final-data-protection.json`。额外比较及脚本修正保存在 `old-cross-listing-replay.log`、`replay-version-scope.json`、`browser-attempt-1-proof.json`、`verify-consumption-attempt-*.py`、`diagnostic-projection-scope.json`、`old-artifact-integrity-attempt-1.log`，不删除历史失败事实。
