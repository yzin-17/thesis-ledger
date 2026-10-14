# P6 上市阶段与港美后续扩展证据

关联：[Spec](../../specs/2026-10-07-p6-market-state-expansion.md)、[Task](../../archive/tasks/2026-10-07-p6-market-state-expansion.md)。本记录仅覆盖首批验收之后新增的上市初期、退市与港美收费/单位范围；原结果及冻结身份保留。

## 真实来源资格

用户已选择上市初期与退市。603350.SH采用2024-07-02～11来源窗口，600462.SH采用2025-07-10～22来源窗口。以下原件已实际请求并读取正文，摘要只取成功返回的原始字节；SSE个别PDF地址返回HTML，不将其摘要登记为PDF证据。

| 原件 | 事实与实际观察时钟 | 原始SHA-256 |
| --- | --- | --- |
| [安乃达主板上市公告书](https://static.cninfo.com.cn/finalpage/2024-07-02/1220512925.PDF) | 第3页首五个交易日无日涨跌幅、其后10%；第9～10页603350、上交所主板、2024-07-03上市。1143071字节，实际观察`2026-10-07T13:20:29.003464+00:00` | `546014a6a533bed4cdc3b556be43f6a7c54d7433f57ff056e16895c16efff0d2` |
| [九有进入整理期首日风险提示](https://static.cninfo.com.cn/finalpage/2025-06-24/1223956705.PDF) | 600462、2025-06-24进入整理期，首日无日限制、之后10%；预计最后交易日不能单独当作最终事实。93402字节，实际观察`2026-10-07T13:24:35.205808+00:00` | `3ace88e84dca6b7f22331782ce283969aa8b34120320e94a1276af46d01a3d83` |
| [退市九有终止上市暨摘牌公告](https://static.cninfo.com.cn/finalpage/2025-07-15/1224162347.PDF) | 2025-07-14实际最后交易日、07-15起连续停牌、07-21摘牌；保留整理结束、停牌和摘牌的不同事实。105816字节，实际观察`2026-10-07T13:24:35.073505+00:00` | `90662f92cb491b542d528ae03561c377fbbaea19ca689040646ab436a0f2971f` |

腾讯精确原价请求实际可读：603350在07-03～11返回7条实际OHLC/成交量；600462在07-10～22仅返回07-10/11/14三条。没有为上市前、停牌或摘牌后补造价格。此处为来源资格探测，最终响应摘要、单位、日历及冻结身份以后续标准目标任务为准。

港美目标环境只配置Yahoo前复权；Longbridge、Tushare、Finnhub、AlphaVantage均未配置且未启用。没有从当前报价或归一化数量授予历史原价/股数/整手/tick资格，已询问可用Provider配置或资料路径。公共费用原文另外核对港股印花税整港元进位、SFC与AFRC独立两位取整，以及美股TAF按实际股数和上限计算；具体来源输入和目标验收未完成前不计作新增收费通过。

## 本地实现与验证

状态来源新增可选`listingPhase`与明确`noDailyPriceLimit`；与停复牌、风险及原比例结构兼容。未上市/摘牌不能声明全天可交易，无日限制和比例限制不能同时存在，所有已知维度引用原件。DSA新增两条精确来源、库存/Manifest/检查探针和实际鉴权HTTP读取。

冻结版本为`frozen-trading-status-v3`，上市维度拒绝回填旧v1/v2身份。执行视图禁止未上市/摘牌日成交，整理期仍按已知规则交易；原始价格行不回写，基准同样排除禁成交日期。上市阶段原件摘要及实际核验时钟逐日校验，明确无日限制只用于同一标的/窗口的原价研究。页面与诊断保存阶段、来源时钟和无日限制原因；末次价格不能当作摘牌后的可变现价值。

| 验证 | 当前结果 |
| --- | --- |
| Schema上市/旧状态定向 | 20通过 |
| DSA状态/上市来源相邻 | 43通过；新增实际Control/鉴权HTTP与精确生产读取12通过 |
| Server上市执行/价格模型/旧快照定向 | 22通过 |
| Desktop上市/旧状态消费 | 13通过 |
| Schema全包 | 766通过，`p6-lifecycle-schemas-gate.log` |
| Server全包 | 正确入口`pnpm --filter @thesis-ledger/server exec vitest run --maxWorkers=2`：2554通过、217跳过，`p6-lifecycle-server-gate-2workers.log`。此前多余`--`导致并发限制未生效，16项超时及WASM后续错误，不作为通过证据 |
| Desktop全包 | 761通过，`p6-lifecycle-desktop-gate.log` |
| Server/Desktop类型检查 | 通过 |
| ESLint、依赖边界、文件尺寸 | 通过，9项原存量尺寸警示 |
| DSA正式全门禁 | 后续已8213通过、626子测试通过；2026-10-08纳入新增公共费项后正式全门禁8224通过、626子测试通过，1 skipped、4 deselected不计通过；见`p6-extension-dsa-gate-final.log` |

日志位于主仓忽略目录`.recovery-artifacts/m31-2026-10-07/`。以上为本地阶段记录；正式目标、Worker、独立复算、无网络重放及真实页面/下载结果见下节。

## 2026-10-08 上市与退市真实闭环

本组使用当前开发Server/Worker及DSA真实接口，标准入口为`node scripts/listing-lifecycle-target.mjs --listing|--delisting --run`。运行前核对DSA上市来源包/读取器及Worker上市执行helper与宿主构建摘要一致；Worker实际路径为`/app/apps/server/dist/src/backtest`，Schema实际位于容器`node_modules`的文件依赖。上市helper SHA-256为`89b88c0de4e24ddb9adb39e8aece8d8d52644697348a0b6a54ce47e891531a9c`，状态Schema为`cd9ad3938cef80f40a8f20f365be49ddfc04039c75ee3072de744c57a5aa9a41`。没有以宿主文件存在替代容器核对，也没有回写原价产物。

第一次上市准备被真实API拒绝：现有日线策略需要一根预热Bar，零预热预算不合法。验收脚本因此采用2024-07-03真实上市首日预热、07-04～11回测；上市前价格未补造，也未修改生产预热守卫。失败准备只保存了策略版本，未创建回测任务；失败日志为`p6-listing-target.log`，成功为`p6-listing-target-second.log`。公告来源包仍保留首五个交易日完整规则，目标回测消费其中07-04/05/08/09的无日限制及07-10/11的10%限制。

| 目标 | 持久身份与结果 | 独立现金账 |
| --- | --- | --- |
| 603350.SH上市初期 | `b706a643-54bc-4ff2-b971-9f6552fbb5bf`，succeeded，checksum `47c15656dffc1c5f`，Snapshot `2c656e5fa6f18916fcfe81c56781d61cfdb7f428f5de3fa3b3426d3753d853ec` | 5笔成交；期末现金CNY 38872、1400股、净值86080；收益-0.1392；6个净值点一致 |
| 600462.SH整理至摘牌 | `b049cd97-5404-49c2-85a8-c1de695afc65`，succeeded，checksum `58b993fdf96df42d`，Snapshot `6891b78a65b366798328c9c8438ab6a3d7b7668527f8ba08b4ba1800fca40a05` | 07-11买263100股、07-14卖出；期末现金及净值CNY 102631、持仓0、收益0.02631；9个净值点一致 |

两目标真实原价均绑定100股整手及0.01价位，采用显式零收费/滑点阶段研究。`listing-lifecycle-independent.py`使用Python Decimal独立验证数量向下整手、逐笔价格、后续10%限制/价位舍入、现金、各净值和收益。600462冻结的交易Bar截至07-14，07-15～20为公告停牌，07-21～22上市阶段为已摘牌、停复牌维度为unknown；不同事实未合并。整理期实际成交，停牌及摘牌后没有Bar或成交。未上市/已摘牌有Bar时的拒绝由生产执行定向测试补充覆盖，不伪造真实历史价格。

新阶段产物均为`frozen-trading-status-v3`。各目标在当前Worker通过只读`research-window-replay.mjs`两次生产重放，结果及Snapshot一致，fetch/http/https/net/tls全部阻断且网络调用0；输入由冻结产物读取，不重新读取Provider。独立输出为`p6-listing-independent.json`、`p6-delisting-independent.json`。原价规则研究基准保持不可用，未把阶段验收解释为基准实际数量、分红/拆合股或严格历史PIT验收。

Safari实际使用`http://127.0.0.1:5181/strategy/jobs/<任务ID>`。两任务页面均显示已完成、原始价格研究、公告原件摘要/核验时钟、阶段和日限制；退市页面分别显示整理期、公告停牌、已摘牌及末次价格的限制。实际点击诊断下载，`multimarket-rules-diagnostics-check.mts`逐字段核对完整客户端映射、持久结果和冻结身份：

- 上市：`/Users/yzin/Downloads/backtest-b706a643-54bc-4ff2-b971-9f6552fbb5bf-diagnostics-v2.json`，SHA-256 `bdf3878131001266e4ceb9bf8e50aa13c72ea23bf4fd766368543a948e45eaed`。
- 退市：`/Users/yzin/Downloads/backtest-b049cd97-5404-49c2-85a8-c1de695afc65-diagnostics-v2.json`，SHA-256 `7811da40db3191c751dac37007617027f6f7af3b85c97f14d97aca7f4bb6be55`，完整字段一致。

2026-10-08定向补验Schema7、Server8、Desktop9项通过，涵盖新增收费、上市阶段及诊断消费者；沿用输入未变化的最近包级门禁，不重复构建Server/Worker。此前18条终态的结果/Manifest摘要均保持，数据未恢复或覆盖。DSA新增收费包的正式镜像更新及收费目标记录在后续证据中，不将其未完成部分计作上市功能或全部港美扩展通过。
