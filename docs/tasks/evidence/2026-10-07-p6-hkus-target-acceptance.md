# P6 港美股收费与状态目标验收

日期：2026-10-07。关联：[Spec](../../specs/2026-10-07-p6-market-state-expansion.md)、[Task](../../archive/tasks/2026-10-07-p6-market-state-expansion.md)、[境内风险与限制验收](2026-10-07-p6-cn-target-acceptance.md)、[M31 现金验收](2026-10-07-m31-target-acceptance.md)。

## 后续补全结论

本文保存功能收口时的来源、任务及页面证据。后续已补齐DSA正式全门禁（8183项及626子测试通过）、正式`update.sh all`和开发镜像固化；6条当前快照、11条旧备份快照在新Worker各两次重放通过，14条原有持久终态保持。新现金任务的独立复算、真实页面和下载通过。下方原镜像及49项失败记录属于此前阶段，当前结果以[补全证据](2026-10-07-p6-completion-gates.md)为准；10-06指定旧资产仍待较新备份。

## 结论与实际边界

用户选定的 P6 功能范围已完成：000995.SZ 风险警示及 5%→10% 涨跌幅变化；00147.HK 与 GME.US 各一个真实收费和状态切片。港美两条标准准备、创建、Worker 任务均持久化为 succeeded/attempt1；费用进入策略及基准，盘中暂停进入明确选择的保守日线模型，冻结、独立复算、两次无网络重放、实际 Safari 与保存的诊断文件均有证据。

港美使用实际 Yahoo qfq、归一化连续数量、固定供应商快照。历史原始份额、整手、价位与严格历史 PIT 尚未核实；身份原件保留 lotSize/tickSize 成对 null 和当前观察时钟。原价模式缺单位仍拒绝。部分公共费用按模拟成交额、每笔每项两位小数 halfUp 计算，其他税费、券商费用未纳入，佣金和滑点明确设为零。它们不是完整券商账单。

已保存的盘中事实与日线执行解释分别冻结。未披露状态保持 unknown；排除日期只由真实交易会话与已知区间相交推导，不能把盘中暂停改写为全天停牌事实。US 新模型另选 `valid-metrics-with-status-rejections-v1`，保留正常状态拒单及有效成交、指标，结果至少 partial；无标记的旧任务保持原重放身份。

## 输入与原件资格

| 输入 | 已核验范围与时钟 | 原件 SHA-256 |
| --- | --- | --- |
| HK 暂停 | [HKEX 2025-08-07 通知](https://www.hkexnews.hk/listedco/listconews/sehk/2025/0807/2025080700179.htm)，11:14 暂停；实际观察 `2026-10-07T08:06:24.594772+00:00` | `1fb20e55e00a07b9b1507ccdbe7adffe7465d2fc7c85957fca86208662c45316` |
| HK 恢复 | [HKEX 2025-08-08 通知](https://www1.hkexnews.hk/listedco/listconews/sehk/2025/0808/2025080800075.htm)，09:00 恢复；实际观察 `2026-10-07T08:06:32.080963+00:00` | `29a2264e7b74a5c17beedb73b684bed9412f9f4fba6a8290e2e2ca6d9437704b` |
| HK 交易费 | [LSD/086/2022](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2022/086_22_SEHK_OP_Trading-Fee_e.pdf)，2022-11-14 发布、2023-01-01 生效，双方 0.00565%；实际观察 `2026-10-07T08:12:18.131611+00:00` | `ebf57bb5b3041ec0ae7bc209b07a22517acce0d3904c0dee12c4a2fdf0efbd1d` |
| US 暂停 | [NYSE 历史 CSV](https://www.nyse.com/api/trade-halts/historical/download)，7,877,651 字节、74,110 行。05-13 GME 匹配九条，当前只保存成功工具输出中的三条完整记录；观察取实际成功读取完成记录 `2026-10-07T06:10:07.006Z`，发布日期未知 | `9ee2c59fc05fefc2888774725b40380e140a01b0231f1c686395de217e7ec0f9` |
| US 费率 | [FINRA 2024-05-01 通知](https://www.finra.org/sites/default/files/2024-05/Information-Notice-050124.pdf)，Section31 从每百万美元 8.00 改为 27.80；实际观察 `2026-10-07T08:13:46.219970+00:00` | `db7c520c952e0c7cc91ad305f6bc7a0d0e4d45435f3e30486bb75588f9a8be70` |
| US 收费日期 | [SEC Rule31 原文](https://www.govinfo.gov/content/pkg/FR-2004-07-07/pdf/04-15081.pdf)，交易所经清算的销售按结算日；2004-07-07 发布，实际观察 `2026-10-07T08:12:39.174824+00:00` | `9b922313ec9ee68295a89c8f8c989c0c92989fcecedbd756b5ab872f45d282d9` |
| US 结算周期 | [FINRA 24-04](https://www.finra.org/sites/default/files/2024-02/Regulatory_Notice_24-04.pdf)，T+1 自 05-28 生效，本窗口仍为 T+2；2024-02-26 发布，实际观察 `2026-10-07T08:13:49.435373+00:00` | `b3b74a8cc5f150839cd5a209026d60c0db449722ab62ce38c310506b74d612e5` |

US 三条来源区间均为 America/New_York：`10:12:46–10:17:46`、`10:20:06–10:25:06`、`10:39:59–10:44:59`，日期 2024-05-13、偏移 -04:00。重新下载返回 403，没有补造其他记录，也没有把失败页面的摘要作为原件依据。

身份是 SDK 解析后规范 JSON 的实际观察，不冒称网络原始字节。HK 身份观察 `2026-10-07T07:52:06.448815+00:00`，摘要 `8e7920f9f34f9082c54d70863442c0f29b0fd1245bf2a48ea6b08e9421f2a43f`；US 观察 `2026-10-07T07:52:08.548528+00:00`，摘要 `6d9f6f1434d1a185e0168eaf785cbe2e722a53183f3c508c97c6abf36a844753`。XHKG/XNYS 使用已核验 exchange-calendars 4.13.2 发布输入及真实会话，发布可得时间 `2026-03-10T03:24:37.055242+00:00` 保留。

HK 08-07 实际 Yahoo 返回正价、零成交量占位；仅在明确缺日研究协议下，将该观察连同原响应摘要冻结为 `excludedZeroVolumeObservation`，从成交、信号、估值和基准 Bar 移除。该日仍是缺 Bar 研究假设，真实全天状态未知。普通读取、CN、非法 OHLC、负量或矛盾成交额没有放宽。港美日期按当地日零点携带时区/DST，日线完成按实际收盘/早收市校验；来源 availableAt 保持实际抓取时间。

## 持久任务与金额

| 项目 | HK | US 最终模型 |
| --- | --- | --- |
| 标的及窗口 | 00147.HK，2025-08-06..11 | GME.US，2024-05-10..24 |
| 任务 | `d713d4da-646e-478b-ace1-d5564dcae835` | `38ee3c6a-cdb0-4432-8313-86bb6466d8bb` |
| PostgreSQL 终态 | succeeded / attempt1 | succeeded / attempt1，completeness=partial |
| 结果校验值 | `5e4ebbc2bceeb496` | `d89b0082bfed48af` |
| Snapshot | `c394b4091a0c9050525c23fd61554f0d2ad5c9fd6550c47beb77872bfe8f431e` | `12baac7e8765dace81cd71e85d5434af5abfd02a847846bb01a522dc1311ac87` |
| 状态模型排除日期 | 2025-08-07；08-08 恢复早于开盘，不排除 | 2024-05-13，保留一笔已知状态拒单 |
| 成交与公共费用 | 2 笔，HKD 4.96 | 7 笔，USD 3.08 |
| 最终现金 | `87873.826373620141306778252860997627663373017128100726957803275` | `33416.7253617444390533303687355119455223263476033800277567529` |
| 最终归一化数量 | 0 | `2714.4408139470467880004766256169911157107323` |
| 最终权益 | 与现金相同 | `84991.1008267383280253394246222347767208302613033800277567529` |
| 策略收益 | `-0.12126173626379858693` | `-0.15008899173261671975` |
| 基准净收益 | `0.50229334348733008692` | `0.08817136072613838379` |

公共费用与状态引用从实际 PostgreSQL `snapshotManifest` 读取：分别为 `public-fees-model-v1` 与 `frozen-trading-status-v2`。没有用队列状态替代业务终态。

US 费率边界按实际 XNYS T+2 会话推导：05-22 结算生效对应 05-20 成交起使用新率；有效成交覆盖边界两侧。HK 08-08 开盘买入、08-11 开盘卖出，费用分别 2.82 和 2.14。独立 Python Decimal 200 位计算、数量 40 位 halfUp 及买入预算约束逐笔复算；逐日权益分别核对 4/11 点。基准独立按首个有效日收盘买入、最后收盘清算，使用相同冻结收费和排除日期：HK 费用 5.65/8.49，US 0/3.03。金额、数量、净收益及超额收益一致。

复算入口为 `scripts/multimarket-rules-independent.py`，读取冻结输入，不调用产品费用计算器、来源或网络。运行与复算日志保存在主仓忽略目录 `.recovery-artifacts/m31-2026-10-07/` 的 `p6-hk-*`、`p6-us-final-*`。

## 重放与兼容

`scripts/research-window-replay.mjs` 在实际 Worker 内只读 PostgreSQL、Manifest 与 Artifact，校验摘要并执行两次重放，阻断 fetch/http/https/net/tls。HK、US 最终任务均两次一致、网络调用 0。

最终运行代码还重放以下已有快照，各两次一致、网络 0：

| 快照 | 保持的结果校验值 | 日志 |
| --- | --- | --- |
| HK 当前样本 | `5e4ebbc2bceeb496` | `p6-final-hk-replay.json` |
| CN 风险与限制 | `ae94a77d4d9cc8ef` | `p6-final-cn-policy-replay.json` |
| M31 已到账 | `62957fa06013f9a3` | `p6-final-m31-paid-policy-replay.json` |
| M31 应收未到账 | `0e1382b3b7059adf` | `p6-final-m31-receivable-policy-replay.json` |
| US 无新可用性标记的旧任务 | `745734da7523ddce` | `p6-us-old-policy-replay.json` |

旧 US 任务 `2fdcbddc-092e-4c88-bb5c-28166849a4ca` 的不可用分类及原校验值没有回写；最终任务明确冻结新模型选择后为 partial，7 笔有效成交和金额相同。

## 实际页面与下载

实际 Safari 访问当前源码的独立开发前端 `127.0.0.1:5180`，保留用户原有 5173 页签。HK 显示 -12.13%、交易费、原暂停/恢复时刻、未知状态、仅排除 08-07、部分费用及原件时钟。US 最终任务显示“结果部分可用”、-15.01%、三条盘中记录、05-20 成交/05-22 结算边界及 T+2，未核实项目和来源摘要可见。

实际点击下载后读取 Downloads 文件；`scripts/multimarket-rules-diagnostics-check.mts` 与 `scripts/market-rule-diagnostics-check.mts` 深度比较完整当前客户端映射、API、持久结果校验值、Snapshot、原件时钟和费率政策，均通过。检查没有生成替代下载文件。

| 实际保存文件 | 文件 SHA-256 |
| --- | --- |
| `/Users/yzin/Downloads/backtest-d713d4da-646e-478b-ace1-d5564dcae835-diagnostics-v2.json` | `878385c48d17f79d00edb3a9d04682e49df1000f532458e822ac512a05836e73` |
| `/Users/yzin/Downloads/backtest-38ee3c6a-cdb0-4432-8313-86bb6466d8bb-diagnostics-v2.json` | `c1d03a3a2637225aff072f4fa94c2c2f6b08f8b9c017762596c574a34d671f9e` |
| `/Users/yzin/Downloads/backtest-57def779-97d0-4562-9fe0-b613fe90269e-diagnostics-v2-2.json`，当前映射重新导出的 CN 文件 | `792e20e6f238c5732315b9972682f429a7a76610ee649357baab1e3a82685c4c` |

## 工程与目标运行态

正式入口依次使用 `sync-code.sh all`、`sync-code.sh thesis-ledger`，最终 `p6-status-policy-final-sync.log` 退出 0；五个容器 healthy。最后一次源码构建、目标复制和新任务之后的只读重放/实际下载均通过。同步只修改容器可写层；重建容器会恢复镜像内代码，不作为镜像发布证据。Server/Worker 镜像仍为 `sha256:fc4df9e949938b8be0aa236f8783a9a0f021500f399e1f1ba4ed0ab3b36da3f1`，DSA 仍为 `sha256:e6cf0d1d5a7de3e7ba904b35d0b6b792d4564d2099a4abeeb1b021b20e1a8733`。没有数据库结构、卷、运行时依赖或原生客户端配置变化。

| 验证层 | 最后结果与日志 |
| --- | --- |
| Schema 全包 | 751 通过，`p6-schema-final-all.log` |
| Server 全包 | 2549 通过、217 跳过，`p6-server-final-all.log`；命令 `pnpm --filter @thesis-ledger/server test -- --maxWorkers=2` |
| Desktop 全包与最终构建 | 753 通过，`p6-hkus-desktop-all.log`；后续可选模型字段构建通过，`p6-client-final-build.log` |
| DSA 本次来源/网关/零量/日期/身份相邻验证 | 分阶段定向通过；全量发现的市场范围和新 Provider 列表旧断言已更新，两个相邻文件 30 通过，`p6-dsa-adjacent-final.log` |
| 边界与尺寸 | `node scripts/check-boundaries.mjs`、`node scripts/check-file-size-guardrails.mjs` 退出 0，`p6-closure-boundary.log` / `p6-closure-size.log`；9 个既有尺寸警示，ratchet 通过，未提高阈值或添加忽略 |
| DSA 全包 | 本次 `.venv/bin/python -m pytest -q` 实测 8135 通过、49 失败、3 跳过，`p6-dsa-final-all.log`。其中上述两项随后修复并定向通过；没有再次执行全包，仍不记全门禁通过 |

DSA 其余失败涉及共享工作区 Tushare/HiThink/RQData、自主来源选择、凭证与旧准入断言；保留并行修改，未将本组通过等同于整个工作区绿色。Task 留在当前目录，继续登记工程全门禁和用户授权另补的旧环境资产回归；不移到 TODO 或归档来隐藏缺口。P1～P5、B1～B4、另一对话 C1～C3 的原验收结论不重做；M32/R02/S05/F01 保持各自范围。未 stage、commit、push 或发布。
