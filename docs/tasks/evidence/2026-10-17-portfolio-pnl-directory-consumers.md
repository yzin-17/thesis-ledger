# 收益指标、目录消费与触屏验收

2026-10-17，主仓 `main@da002744` 的未提交工作树，Server `3000`、Web `5174`。本次使用独立记账账户，不连接券商、不执行证券交易、不改写原账户。现行合同分别见[收益指标](../../specs/2026-09-09-portfolio-pnl-metrics.md)与[目录聚合](../../specs/2026-09-18-instrument-directory-server-read-aggregation.md)。

## 收益样本与修复

专用实际模式账户 `c12e0c98-3319-451f-aad6-d3fd9e9df8a0`（收益与目录验收-20261017），通过正式 Ledger API 入账 CNY 10,000，买入 `510300.SH` 200 份，之后分三次卖出。买入价 4、费用 2；三次卖出分别为 50×4.5、100×4.6、50×4.7，各费用 1。所有费用为 CNY，规则资格保留 `UNVERIFIED`，不由手工成交提升历史规则可信度。

| 阶段 | 剩余数量 | 现金 | 已实现盈亏 | 未实现盈亏 | 累计盈亏 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 仅买入 | 200 | 9,198 | 0 | 47.2 | 47.2 |
| 第一次卖出 | 150 | 9,422 | 23.5 | 35.4 | 58.9 |
| 第二次卖出 | 50 | 9,881 | 81.5 | 11.8 | 93.3 |
| 全部卖出 | 0 | 10,115 | 115 | 0 | 115 |

持有期间的真实报价为 4.236、前收盘 4.242。表格记录 API 的原有口径：未实现盈亏按剩余持仓成本计算，卖出部分分摊费用后计入已实现盈亏；没有将持有期间累计指标改写成现金流收益率。三个 Close Slice 净收益为 23.5、58、33.5；清仓后的成本分母 802、累计收益率约 14.3392%。清仓后今日收益金额和收益率为 null，基准仍为 `PREVIOUS_CLOSE_CURRENT_HOLDINGS`。

清仓时 API 正确，但页面因 `positions.length === 0` 退回首次使用空态，隐藏现金、收益和交易入口。修复 `portfolio.queries.ts`：当前模式存在活动账户时保留正常组合状态；只有其他模式账户时仍展示当前模式的首次使用状态。新增四项渲染与查询消费回归，覆盖现金账户、平仓收益、未知成本/FX 降级及模式隔离。

Web 390px 和安装包分别核对部分、多次卖出；清仓修复后两端均显示现金 10,115、累计与已实现收益 +115。安装版实际→模拟→实际切换分别读到对应模式数据，未混用收益。上述安装态只覆盖原样本；后续未知成本、FX 与费用币种补验见下节，不扩大安装包证据范围。

### 未知成本、真实汇率与费用币种

通过正式 Ledger API 创建两个独立纸面账户，原账户、来源配置和准入保持不变：

| 自建账户 | 真实持久化输入与结果 | API 与 Web 结论 |
| --- | --- | --- |
| 未知成本验收-20261017（`02cee975-edfc-4a2d-b0bc-3db3709d3a5a`） | 余额观察 100 份 `510300.SH`，未填平均成本；随后卖出 100×4.236 CNY | Close Slice 的 `costEstimated=true`、`netRealizedPnl=null`；组合累计/已实现为 null；390px 四宫格保持“—”，详情列出缺成本与缺建仓边界，未补零或猜测成本。 |
| 汇率与费用验收-20261017（`1e51b6e3-0773-4a58-813a-00c3a66efc64`） | USD 入账 1,000，100×1 买入、100×1.1 卖出，买卖各费用 1 USD；已实现 8 USD、现金 1,008 USD | 真实 yfinance `USD→CNY=6.676799774169922`、`rateDate=2026-10-16`，换算为 `53.4144 CNY`；原 CNY 样本反向换算 `17.2238 USD`。IAB 组合显示累计/已实现合计 `+168.41 CNY`。 |
| 同一 USD 账户的独立费用场景 | 新一轮 100×1 USD 买卖，买入费用 1 CNY | 已确认 `FEE_CURRENCY_MISMATCH`，净实现与组合累计为 null；汇率仍可用。页面保持不可用，交易详情明确显示“费用币种与成交币种不一致，净收益暂不可确认”。 |

USD 场景使用已确认标的的显式 USD 计价纸面输入，仅验证账本/换算边界；不声称该 ETF 的来源市场价格为 USD，也不提升交易规则资格。最初 `AAPL.US` 输入因身份未确认返回 409，未绕过该限制或伪造身份。

首次真实 yfinance 读取成功，但后续直接/反向缓存返回无时区 `fetchedAt`，Server 既有时点校验拒绝整个汇率结果。修复 DSA `api/thesis_ledger.py`：缓存时间有可靠时区时按既有 helper 规范为 UTC；缺失/无时区时省略原本可选的 `fetchedAt`，保留实际 rate/date/source，不猜 UTC、不写回数据库、不补“现在”。新建 `tests/test_thesis_ledger_fx_cache_timestamp.py` 六项 HTTP 合同测试，覆盖直接/反向与缺失/无时区/有时区，先六项失败、修复后通过，确认缓存分支不请求 SDK 或写库。DSA `./scripts/ci_gate.sh all` 结果 `10418 passed, 1 skipped, 4 deselected`（另有 626 subtests）；由 infra 官方 `./scripts/sync-code.sh dsa` 同步成功，镜像不变，真实缓存与收益重读随后通过。

FX 不可用的计算/渲染分支复用有效输入未变的定向回归；修复前真实缓存失败保留为 `pnl-real-fx.json`，修复后的正反换算为 `pnl-real-fx-recovered.json`，不将前者继续描述为外部来源不可用。已实现净收益来自正式 Trade Close Slice，并未将测试固定值写入生产计算。费用原因映射的六项 Portfolio 交易回归通过。

清理使用正式现金流和可恢复停用：未知成本账户支出 423.6 CNY；USD 费用场景按 SELL→BUY 顺序作废本轮两笔记录，原 8 USD 场景恢复后支出 1,008 USD；原收益账户再次停用。三个账户均为停用、现金 0、持仓 0；所有事实和作废链保留。UTC `2026-10-16T21:59` 保护核对通过：七张原始业务表一致、54 份成功 V3 结果不变、活动回测 0，原 Provider/default、AiRun/AiInvocation 均未变。

本节关闭收益指标 G1，快照 R3、目标历史点位和基金正式校准继续开放。原始回执为 `unknown-cost-owned.json`、`currency-pnl-owned.json`；Web 截图为 `ui-unknown-cost-narrow.png`、`ui-pnl-fee-mismatch-detail.png`，均在下文同一本地证据目录。

## 目录消费与修复

- 清仓后 Position 为 0，Ledger `events`、`events/audit`、`events/replay?asOfRevision=5` 均保留五条事件，并返回 generation=9、`510300.SH → 沪深300ETF华泰柏瑞`。重放是 API 合同，当前 Desktop 没有独立重放页面；本次验证真实响应，不新增页面。
- Ledger 有效事件已消费名称；修正链原来只显示事件类型和时间，补用审计主响应的 `instrumentDirectory`。作废项通过同链来源事件解析代码，不改动事实 payload、修正链和操作条件。两项真实挂载回归先失败后通过，覆盖无 Position 时的名称与代码回退。
- 现行 `JournalCandidateBrowser` 漏掉目录映射，旧候选组件已有映射，不能据旧实现判定新版已通过。修复当前页面使用各页主响应的目录信息；已平仓交易周期、三个 Close Slice 和旧引用均可显示名称。回归覆盖目录缺失和追加空页后名称保留。
- 实际 Web 与最新安装包均核对四个候选显示同一名称。复盘摘要和成交表的时间改用现有中文日期格式，原始追溯 JSON 保留来源时间。
- Web 用真实审计/候选响应仅替换目录为 `items=[]`、`unresolvedSymbols=['510300.SH']`：审计记录、更正/作废操作和四个候选保留，均回退代码；随后清除拦截并恢复真实响应。这是受控降级证据，不是目录服务真实故障。
- 本次审计网络段只有一个审计主请求；此前候选、对象和历史请求段未出现独立目录查询。源码继续只消费主响应，没有新增目录查询或页面名称持久化。

以下补验已覆盖此前保留的安装态降级及完整 Network/Console 条件，DIR-AC6 可关闭；交易 T18 不随之关闭。

### 安装态目录降级与完整请求记录

2026-10-17 再次启动同一 `app.asar` 的 macOS 安装版，端口为 `62112`。仅临时恢复专用账户 `c12e0c98-3319-451f-aad6-d3fd9e9df8a0` 的活动状态，不新增或改写任何 LedgerEvent；结束后恢复停用。

通过安装版自身 DevTools 的 Local overrides，分别保存真实 `events`、`events/audit` 和 `review-candidates` 响应，仅将目录替换为 `items=[]`、`unresolvedSymbols=['510300.SH']`。六条账本事实、修正链、候选身份及其他业务字段逐字保留。有效成交四行均回退 `510300.SH`，更正、作废、查看修正链入口仍在；修正链仍显示买入成交、当前有效与代码。Journal 的一个完整周期和三个减仓候选均保留代码及选择对象入口。这是客户端受控未命中，不宣称发生了真实目录服务故障。

安装版 Ledger 完整 Network 集合为 8 项：页面、JS、CSS、字体，以及 `accounts`、`portfolio/valuation`、`ledger/:id/events`、`events/audit` 四个 API；Journal 重载为 6 项：页面、JS、CSS及 `accounts`、`review-candidates`、`review-snapshots`。所有响应 200，没有独立目录或逐证券查询。两页及审计面板的 Console 均为 `0 messages`。

内部浏览器 Web 也重新记录完整请求：Ledger 只有上述四个 API，Journal 只有候选和快照主 API；开发模式重复读取不产生额外目录接口。CDP 事件分页读取至末尾，运行异常为 0，控制台 warning/error 为 0。源码继续只读主响应目录，不持久化页面名称；此前 API 重放、目录解耦和分页回归复用未变输入的通过记录。

验收后点击 `Clear configuration` 移除覆盖目录授权，重载确认四条成交恢复真实名称；专用账户通过可恢复入口重新停用。截图 `directory-native-{ledger-fallback,audit-fallback,journal-fallback,console,ledger-console}.png`，完整请求集合 `directory-{native,web}-network.json` 位于同一 `.recovery-artifacts/portfolio-pnl-2026-10-17/`，不将临时覆盖文件加入源码。

## Safari 触屏

使用已有 iPhone 17 Pro 模拟器、iOS 26.5 内置 Safari，访问 `http://127.0.0.1:5174/test/browser-performance-trend.html`。该入口复用生产 `PerformanceSnapshotTable`/图表，使用明确标注的固定输入，不请求 Provider、不生成业务历史；只增加最近 `pointerType` 的可见记录，不人工派发 DOM 事件。

通过模拟器界面点击后显示 `pointerType=touch`，不以窄视口或鼠标事件代替触屏。稀疏跨日点分别选择 10-03 17:00 的 1,200 与 08:00 的 1,100；后者正确显示估算、低覆盖、披露 14%、定价 8%。2,000 分钟点左右两侧可分别选择 10-04 16:15 的 2,995 和 10-03 07:08 的 1,008，Tooltip 保持在页面内，点击释放后仍可读。缩短为单点可选择 10-03 07:00 的 1,000；切换空数据后清除旧 Tooltip，并说明没有历史点。

本次补齐原 Spec 的“触屏点击选择最近点”及 AC7 的触屏读值；既有鼠标、键盘、宽窄屏和粒度证据复用，T4.I1 可关闭。没有将固定输入当成真实历史点位、基金披露或正式校准，也不扩展为拖动手势验收。截图为本目录下 `touch-{sparse-middle,sparse-low-coverage,dense-right,dense-left,single,empty}-safari.png`。验收后关闭本轮启动的模拟器，保留设备与 App 数据。

## 版本、检查与数据保护

最新 macOS arm64 安装包使用本机已安装 Electron `43.2.0`，未签名，未发布；通过 `package:mac:dir --config.electronDist=node_modules/electron/dist` 构建，实际启动端口 `61564`。`app.asar` SHA-256：`8edfd2899ad573407d66ce5856edc33400d68f42f623b22dd061e9912e22ce1a`。

前一阶段 Desktop 全量 144 文件、857 项、typecheck/build 及修改范围静态检查通过；后续 UI 草稿/目标刷新修复后的全量为 145 文件、860 项。再追加费用原因中文映射后，六项交易回归通过；DSA 后续的缓存合同修复与完整门禁见上节。Server 未修改这些计算输入，复用其有效检查，不重复构建正式研究镜像。

工作区依赖检查、13 项无障碍静态断言及 `git diff --check` 通过。对当前 131 份变更 Markdown 扫描 902 个本地文件/锚点链接，未发现失效目标；另将历史性能证据中两个已不存在的临时截图链接改为路径与原摘要追溯。

随后执行 infra 官方 `./scripts/sync-code.sh thesis-ledger`，兼容预检和更新成功。目标使用本轮源码，镜像 ID 不变；这是容器可写层同步，不作为镜像重建或发布证据。

本账户验收结束后用正式现金流支出 10,115，再通过可恢复停用入口停用；当前现金 0、持仓 0，成交和审计事实保留。未永久删除任何新增账户。保护检查确认七张原始业务表与基线一致、54 份成功 V3 回测结果未变、活动回测为 0。

本地原始回执和截图位于 `.recovery-artifacts/portfolio-pnl-2026-10-17/`：`owned-objects.json`、`directory-api.json`、`retired-account.json`、`closed-packaged-final.png`、`ledger-audit-{web,packaged}.png`、`journal-directory-{web-unresolved,web-restored,packaged}.png`。回执留在本机；上述关键输入、结果与未通过边界已在本文件保存，不依赖再次重做验收。
