# 竞技场采样研究规则的本地整改验收

日期：2026-11-23。归属：[主任务 T06.2a0～T06.2c](../tasks/2026-11-12-autonomous-model-arena.md)、[依赖复盘 R01～R07／D01／D02](../reviews/2026-11-23-arena-practical-scope-review.md)。共用账户规则见[长期设计](../design/2026-11-23-research-account-policy.md)。

本记录保留前序整改时点；随后完成的深市 ETF 状态接入及一次实际富途读取见[补充验收](2026-11-23-arena-sz-etf-state.md)。本记录的零来源调用声明仅指前序本地实施阶段。

## 实施范围

新建自主比赛由 Server 冻结 `simulationPolicy: sampled-v1`；实时与回放消费同一研究口径。三市场股票和 ETF 使用协议配置的费率、最低费及滑点，公共法定费用不另叠加，不模拟每日法定涨跌停。CN 买入份额下一实际交易日可卖，HK／US 当日可卖；所有卖款成交当日可再投资。没有模拟提现。

本批仅修改本地源码、文档与离线输入。真实模型调用、资格探针、自动重试、真实比赛操作、业务数据库读写、来源／路由变更、目标同步、重启、提交和推送均为零。原工作区及三个 checkout 保留；没有新建 worktree 或使用子代理。此前普通回测、G02、G04 和未变的持久化证据继续复用。

## 逐项整改

| 复盘项 | 本地实现及核对结果 |
| --- | --- |
| R01、R03 | [采样读取器](../../apps/server/src/market/market-sampled-live-execution.ts)不申请每日精确价格边界或完整公共费用；回放的[规则适配](../../apps/server/src/market/market-arena-replay-rules.ts)只用身份及单位，沿用冻结费用。缺少完整执行制度的原样本仍完成成交，证据明示实际假设。 |
| R02 | CN 仅买单需要下一交易日；HK／US 无此未来依赖。账户扣款、预留、可卖日和现金政策在实际提交／撮合检查中核对。 |
| R04 | [公司行动覆盖](../../apps/server/src/market/market-action-coverage.ts)将覆盖不完整／读取失败记为默认无事件并保留标记；明确事件仍限制受影响证券。实时估值和回放都传递该政策。 |
| R05 | 新采样路径不调用旧美股完整规则刷新，不依赖 FINRA 目录摘要或同日六份证明。原严格资料的目录变化和待复核状态保留，没有声明原收费资料已修复。 |
| R06 | [日历读取](../../apps/server/src/market/market-sampled-calendar.ts)从当日递进至实际所需下一交易日，不固定预取十四日；只传本证券新增父／子单期限。远期覆盖缺失不会被较早收盘替代。回放在确需休市估值时才向前找已知交易日。 |
| R07 | [执行上下文](../../apps/server/src/model-arena/live/live-execution-context.ts)把 `valuationPrices` 与执行 `quotes` 分开；新买单所需其他持仓只估值。回放持仓估值不读取执行资格；撤单不读取新价格或既有委托期限，回放纯撤单也不读取日历。 |
| D01 | 新采样入口具有真实 HK 成功返回，消费富途同次快照中的状态、整手和身份；正式 Data HTTP→共享 Schema→研究入口的隔离验证得到 `available`。 |
| D02 | 策略与等权基准在等于边界时采用相同判断；两种等值边界成对验证。新研究观察不附加每日限价，双方继续共用费用、股数及可卖政策。 |

## 当前证券状态与 ETF

DSA 新增 `GET /api/v3/thesis-ledger/market/trading-observation`，使用 Data Token，受实时行情总开关与相应资产功能开关控制，读取期间策略变化拒绝发布。Server 仅消费 DSA，不自行请求外部交易所。

- CN 股票：东方财富完整当日停牌列表，核对分页及证券完整代码；短缓存保留原观察时刻。停牌时段、复牌、列表截断及身份错误均有离线反例。
- SH ETF：复用现有上交所基金停复牌查询解析器，核对完整分页，区分申赎暂停与交易停牌。未知交易区间保持未知。此阶段 SZ ETF 尚未接入状态读取，返回 `unknown`；该缺口随后由[深市补充](2026-11-23-arena-sz-etf-state.md)修复，不再代表当前本地实现。
- HK／US 股票和 ETF：继续消费富途同次报价快照。港股 `02800.HK` 的 HKD 身份复用已保存的富途静态观察及 Yahoo 身份交叉记录，整手为 500；其他缺少币种证据的柜台保持缺口。
- HK ETF 价位：使用本轮已有港交所 ETP 目录快照，490 个柜台分别选择 Part B／D；`02800.HK` 是 Part D，22.5 港元档位为 0.02。目录未收录证券不猜测价位；目录覆盖不等于这些证券的币种与当前报价均已验收。

目录原文 SHA-256 为 `f6fe5c7a79de9fdba2c54fec7ab2c40c72dd2941b99a269fcf1355623a27f9b9`，来源与摘要随[注册数据](../../apps/server/src/market/market-hk-etf-registry.ts)保留。前序真实源观察仍在私有目录 `/var/folders/v1/gvgmk4cx1mz59vj63jj8_9m80000gn/T/thesis-ledger-source-status-20261123-DtdNWz/`；本实施阶段未重复发送真实请求，也没有把收市快照认证为盘中资格。

## 原样本隔离闭环

[冻结测试输入](../../apps/server/test/market/fixtures/arena-sampled-frozen-business.json)摘取原 2026-11-16 成功回执中的 `588000.SH` 决策、两根真实分钟、身份、交易状态和日历，并保存三个原回执的摘要。没有重新调用模型或改动原私有回执。

[实际回放入口检查](../../apps/server/test/market/sampled-frozen-business.test.ts)调用 `MarketArenaReplayReader`、`LiveExecutionContext`、`arenaSubmitDecision` 与 `arenaMatchOrders`。同一观察不倒填成交；13:02 原分钟以 1.343 元成交原数量 14800，按该样本冻结零费配置扣费 0，现金 80123.6 元、当时净值 100000 元，份额于 11-11 可卖。原附属止损激活并在 11-10 收盘到期，没有延长保护或虚构次日卖出行情。重复观察不重复扣款；原账户、决策及分钟保持不变。

测试明确移除该政策不消费的完整制度与涨跌停输入，仍保留原始证券、状态和价格。`fetch`、实时读取与数据库入口均由拒绝函数阻止，实际调用次数为零。

另有六种市场／资产组合的[业务闭环](../../apps/server/test/market/sampled-execution-business.test.ts)，以受控后续观察覆盖收费、现金预留、CN 当日不可卖及次日可卖、HK／US 当日可卖、卖出款即时再投资、净值和基准政策。该部分的卖出行情是受控测试输入，不冒充真实次日市场验收。错币种、未来抓取时刻、旧行情、停牌、未知状态、已知未处理事件、数量及资金不足保留拒绝。

## 定向检查

命令均从相应仓库根目录执行，Shell 使用 `rtk proxy`；pnpm 使用 `npm_config_registry=https://registry.npmmirror.com`，没有安装依赖。

| 目录 | 命令／范围 | 结果 |
| --- | --- | --- |
| `daily-stock-analysis` | `.venv/bin/python -m pytest -q tests/test_current_trading.py tests/test_futu_market.py tests/test_futu_research_identity.py tests/test_futu_quote_execution.py tests/test_historical_reconstruction.py` | 148 项通过，退出 0；含 Data HTTP 开关、当前状态及既有历史重建。 |
| `daily-stock-analysis` | `.venv/bin/python -m flake8 src/services/thesis_ledger_current_trading.py api/thesis_ledger_current_trading.py tests/test_current_trading.py` | 通过，退出 0。 |
| `thesis-ledger` | `pnpm --filter @thesis-ledger/server exec vitest run`，限定本次 11 个市场／上下文／估值测试文件；跨语言项设置 `ARENA_G03_DSA_ROOT` 为同级 DSA 绝对目录 | 71 项通过，退出 0；跨语言子进程确认零网络／数据库尝试。 |
| `thesis-ledger` | `pnpm --filter @thesis-ledger/domain exec vitest run test/arena-live-orders.test.ts test/arena-live-valuation.test.ts test/arena-live-boundary-parity.test.ts` | 13 项通过，退出 0。 |
| `thesis-ledger` | `pnpm --filter @thesis-ledger/schemas exec vitest run test/arena-live.test.ts` | 7 项通过，退出 0。 |
| `thesis-ledger` | schemas、domain `build`，Server `typecheck`／`build` | 通过；Server build 同时编译本批测试。 |
| `thesis-ledger` | 定向 ESLint、`node scripts/check-boundaries.mjs`、`node scripts/check-file-size-guardrails.mjs` | 通过，退出 0。 |

首次新增 DSA 测试因未登记清单被拒绝，补登记后运行；一次扩展检查误写不存在的测试文件，未执行用例，随后改为既有历史重建测试。首次类型及 Lint 检查暴露测试替身、新返回类型和 URL 参数处理问题，均已修正。港股币种负例不再包含已登记的 02800 ETF，改为未登记 ETF 和错误资产反例。抓取时钟检查还发现旧港股替身未提供必填 `fetchedAt`，已补齐；没有放宽实际时钟校验。上述早期失败不作为通过证据。

## 交付边界

T06.2a0～T06.2c 的源码和隔离范围完成；本文完成时 T06.2d 尚未执行，后续正式同步及实际消费另见[目标验收](2026-11-23-arena-sampled-deployment.md)。本文不能认证当前目标服务已经消费本次代码，也不认证实时盘中撮合、全部证券覆盖或真实券商账单。

真实模型准入、完整历史追平与远端 CI 保持各自原任务状态。它们没有成为本批源码修复的前置条件，也没有因本地通过而标记完成。原严格执行失败、FINRA 目录差异、原模型失败和历史回执全部保留。
