# 招商银行真实历史成交回放证据

对应[规格](../specs/2026-11-09-cmb-historical-arena-replay.md)与[归档任务](../archive/tasks/2026-11-09-cmb-historical-arena-replay.md)。记录涵盖真实历史输入、生产撮合、独立回放发布、接口对账及实际浏览器验收。原始浏览器超时回执保留。

## 输入与来源

- 复用原比赛 `1699f93b-2c2c-4ffc-9ee1-ca806e40d45f` 的有效双模型决策。决策材料截点为 `2026-11-06T14:17:55.841Z`，消息指纹 `ea4daf02f5855e597de8d986a5e923675cbef53a7e363d4d4fcf60d18a8fc218`；原模型回执 SHA-256 为 `7f1587358b6a8e74fadc83657eb5a845de20f557f69b4b81c5b87246f85f5209`。未新增模型调用。
- 真实不复权日线由现行同花顺主源按精确目标读取，单日完整返回 2026-11-09，开 42.55、高 43.05、低 42.46、收 43.01。第一次严格请求未指定研究日历合同，因覆盖前置条件不足失败；改用明确来源、现行研究日历及完整日级证据合同后取得响应。实际只有一个预期交易日且有完整正成交量日线，没有因缺日生成可交易事实。
- 新浪分钟图表首条记录为北京时间 09:31，开盘价 42.55，与同花顺日线和当日 09:36 冻结快照开盘价一致。该记录只作开盘成交旁证，未把交互图表认证为严格价格源，也没有推断其历史首次可见时间。
- [上交所公司概况](https://www.sse.com.cn/assortment/stock/list/info/company/index.shtml?COMPANY_CODE=600036)实际接口 `COMMON_SSE_CP_GPJCTPZ_GPLB_GPGK_GSGK_C` 返回唯一 `600036`：主板 A、上市、上市日期 2002-04-09。当前概况只用于同日捕获的本次重建，不扩大为任意历史日期的上市阶段证明。
- [上交所股票和可转债停复牌](https://www.sse.com.cn/disclosure/dealinstruc/suspension/stock/)页面实际使用的 `GW_PL_JYTS_TFPXX`，按 `startStopDate=endStopDate=20261109`、证券代码和关键字均为空查询：总计 4 条，一页完整取得，含跨日持续停牌及当日结束安排，未包含 `600036`。结合正常上市概况、日历实际开盘及开盘成交旁证使用；未以单次证券检索无结果或日终成交量单独推断开盘状态。旧版接口未明确绑定所选日期，不作为本次资格证据。
- [上交所 2026 年交易规则及附件](https://www.sse.com.cn/lawandrules/sselawsrules2025/trade/universal/c/c_20260424_10816492.shtml)发布于 2026-04-24、生效于 2026-07-06。已读取正式规则和暂缓实施条文原件，核对普通竞价交易的整手、价位、价格边界和交收前卖出限制；所用条款未被暂缓。规则原件摘要 `fc922c433438b2636cb631eab25cca405209712acbb6aaded768c45456ff8888`；暂缓附件摘要 `f4a0d0976a01e3e95f82460170900993824b70d91183e42d09e13ba10a9958c5`。

原始价格、官方返回、规则原件、旧诊断和全部执行回执均保存在忽略目录 `.recovery-artifacts/cmb-historical-20261109/`，资格包逐文件校验摘要。执行来源是在事后取得，真实 `availableAt` 和 `qualifiedAt` 均保留；没有回填为开盘时刻，也没有混入 11 月 6 日决策输入。行情请求的来源费用状态为 `unverified`，未以 HTTP 成功宣称免费。

## 成交结果

执行时点来自已有共享日历会话：2026-11-09 09:30（北京时间）。前收盘 42.88 与原封存 11 月 6 日日线一致；本次规则整手 100、价位 0.01，上下价格边界为 47.17、38.59。

| 模型 | 原目标仓位 | 模拟成交 | 原赛制费用 | 剩余模拟现金 |
| --- | --- | --- | --- | --- |
| Qwen | 30% | 买入 700 股 × 42.58 | 8.94 CNY | 70,185.06 CNY |
| Gemma | 20% | 买入 400 股 × 42.58 | 5.11 CNY | 82,962.89 CNY |

复用目标运行态的 `executeAtArenaOpen`，原费用协议保持 `fixed-v1`：买入 3 个基点、每笔最低 5 元、滑点 5 个基点。42.55 加滑点后为 42.571275，向不利方向对齐价位后为 42.58；数量按 100 股整手向下取整。费用为赛制模型，未冒充完整法定费用或客户实际账单。本次为空仓初始现金买入，不认证历史卖出回款、可卖份额或后续轮次执行。

## 发布与幂等验证

- 新回放比赛：`851546e2-4203-4240-8e96-1627f9851650`，名称“招商银行 · 历史成交回放（复用11月6日决策）”，状态 `ended`。
- 轮次：`d8b96449-415c-443e-843e-33f2c40c5463`，交易决策日为 11 月 6 日，模拟成交日为 11 月 9 日。原请求标识及模型身份回执沿用，审计字段明确为复用；本次新增调用为零，不生成新的模型费用。
- 计划 SHA-256：`572928d0731a88def11148b790d3e5ec72fd3c1bb03314029c928795edf2d24a`。
- `check` 只读计算计划；`rehearse` 在独立新比赛写集上执行后整事务回滚，确认新比赛不存在；`apply` 原子发布。实际重复 `apply` 返回 `alreadyImported=true`，仍为两笔成交。
- 事务前后真实/影子数据计数保持一致：Trade 20、Position 5、LedgerEvent 138；原源比赛连同参赛者、轮次读取前后完全相等。原零成交诊断与模型原回执保持原字节。
- 初次发布把 `closeMarks` 误用为价格数组，轮次 HTTP 接口返回 400。通过同一维护入口的精确 `repair-report` 分支，仅修正新回放自身的已知错误字段，不改成交；现在按 `arenaMarkSchema` 构造每模型收盘账簿，并在提交事务内调用真实 `ArenaRoundReports.read` 验证完整报告合同。原错误及修复回执分别保留。
- 实际 GET 比赛详情、轮次详情、全部点位、两个分模型点位均通过；方向、股数、价格、时间及轮次关联逐条一致，分模型各一笔。
- 使用真实点位 API 返回和真实日线调用 Desktop 的 `placeArenaPricePoints`：全部模型映射为 2026-11-09 两个买入点，单模型各一个；这属于真实输入的展示投影验证，不能替代浏览器视觉检查。
- 原前向比赛 `36b02990-6e85-4c11-a814-035340293de0` 仍为 `running`，轮次零，预算 2 次/40,000 令牌/2,800 微美元未消耗。

## 实施与验证入口

源校验归 DSA 的 `src/services/arena_historical_opening_evidence.py`，仅使用标准库读取已捕获文件；没有新增服务端路由、扩大来源准入或修改实时门禁。维护入口归 infra：

```sh
# 工作目录：thesis-ledger；所有实际 Shell 命令使用 rtk proxy。
node ../thesis-ledger-infra/scripts/model-arena-historical-fill-replay.mjs \
  --mode check --container thesis-ledger-dev-thesis-ledger-1 \
  --receipt .recovery-artifacts/arena-replays/1699f93b-2c2c-4ffc-9ee1-ca806e40d45f.receipt.json \
  --reserved .recovery-artifacts/arena-replays/1699f93b-2c2c-4ffc-9ee1-ca806e40d45f.reserved.json \
  --opening .recovery-artifacts/cmb-historical-20261109/qualified-opening.json \
  --bundle .recovery-artifacts/cmb-historical-20261109/bundle.json \
  --receipt-sha 7f1587358b6a8e74fadc83657eb5a845de20f557f69b4b81c5b87246f85f5209 \
  --plan-sha 572928d0731a88def11148b790d3e5ec72fd3c1bb03314029c928795edf2d24a
```

实际 Node 为 `/Users/yzin/.volta/tools/image/node/26.13.0/bin/node`。同一组输入的 `rehearse`、`apply`、`repair-report` 及再次 `apply` 各执行一次，均退出 0。维护入口每次先从原件重新核验冻结资格包，再检查计划摘要；不重发模型请求。

- DSA：`python3 -m unittest tests.test_arena_historical_opening_evidence -q`，7 项通过。覆盖完整与过滤/分页不完整状态记录、真实停牌、未知上市、价格/日期错配、晚到首条分钟记录、陈旧/未来报价、未知规则原件拒绝及后验可用时间保留。
- DSA：`python3 scripts/data_test_scope.py`，通过，测试目标清单纳入新增文件。三份维护脚本的 Node 语法检查通过。
- Desktop 的真实数据投影通过。第一次使用根目录 `--import tsx` 因未直接安装该入口失败，改用锁定的 `tsx@4.23.1` 本地 loader 后执行成功，没有安装或修改依赖。
- 浏览器控制：官方资料页及本地回放页创建/读取均超时，连可用连接清单读取也超时；停止机械重试。未取得本轮真实浏览器截图，未验证 1440/1024/768/390 视觉、缩放及周期切换。

本次没有修改运行服务源码、依赖或数据库结构；离线校验在宿主执行，数据发布通过仓库维护入口调用现有运行态撮合和报告代码，不需要 `sync-code.sh` 或 `update.sh`。目标应用镜像仍为 `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`。未提交任何仓库变更。

## 查看入口

[回放轮次报告](http://localhost:5173/strategy/arena/851546e2-4203-4240-8e96-1627f9851650/d8b96449-415c-443e-843e-33f2c40c5463)。在招商银行日线图点击“模型模拟买卖点”，选择上述历史成交回放；两个模型均为买入决策。

## 2026-11-22 实际浏览器验收

使用当前 Desktop 应用、自选隔离样本和原冻结招商银行不复权日线。图表包括决策前 20 根日线及 11 月 9 日行情，周线测试以该批日线聚合。目标只读 API 提供比赛、两笔成交点位、分模型结果和轮次报告。本轮新增报价来源请求、回放导入和模型调用均为 0。

1440／1024／768／390 均通过。两笔 11 月 9 日同向买入合并绘制，提示和明细逐笔核对 Qwen 700 股、Gemma 400 股及 42.58 元。宽屏悬浮与窄屏触摸、模型过滤、日线／周线、缩放、回到最新、跳到实际参赛模型及返回自选图表通过。修复的画布重算与窄屏布局见[点位回执](2026-11-09-arena-chart-controls.md#2026-11-22-实际浏览器收尾)。R4 完成。
