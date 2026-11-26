# 日线委托的冻结回放与研究确认页验收

2026-11-18 在共享工作区 `main@1ed418780d19` 完成 T04d.5c 和 T04d.7。T04d.8 的目标 Server／Worker 仍待正式同步及验收。私有回执目录为 `var/acceptance/t04d-freeze-confirm-20261118/`。

## T04d.5c 费用与公司行动

两组独立构造样本均走 `DsaSnapshotBuilder.buildV3`、磁盘 Parquet、`LocalSnapshotV3Runner.run`。冻结后将行情、日历、标的事实、路由策略、路由目录和公司行动六类读取器设为抛错，两次完整 Worker 结果深相等，六类读取器调用均为零。原样保存、默认整笔撮合、按量与全成保护、部分止盈／余量退出的覆盖复用现有回执。另验了两项旧快照／市价兼容。此前模型的 24 份通过回执继续有效。[原生生成和整笔成交回执](2026-11-18-backtest-whole-order-and-native-recheck.md)

样本使用模拟的 600519.SH 原价行情、实际股数口径和 100 万元初始资金。主动设定的压力上限为每根 1,000 股。两笔买入共 2,000 股，5 月 21 日开盘前一拆二。父单原目标 2,700 股调整为 5,400 股，累计成交 4,000 股，撤余 1,400 股，限价从 10 调为 5；关联止损和止盈价格分别调为 4.85 和 5.50。现金分配样本按每股 0.10 元计入 100 元。5 月 20 日净值为 1,000,093.80 元。该回放核对普通原价事件的经济结果，单独的 ETF 登记／发放日研究协议沿用原合同。

| 正例成交 | 数量与成交价 | 佣金 | 印花税 | 过户费 |
| --- | --- | ---: | ---: | ---: |
| 5 月 19 日买入 | 1,000 × 10 | 5 | 0 | 0.10 |
| 5 月 20 日买入 | 1,000 × 10 | 1 | 0 | 0.10 |
| 5 月 21 日止损卖出 | 1,000 × 3.996 | 5 | 2 | 0.04 |
| 5 月 22、25、26 日继续卖出，每日一笔 | 每笔 1,000 × 3.996 | 每笔 0 | 每笔 2 | 每笔 0.04 |

正例跳空开在 4 元。止损触发后取消关联止盈及父买单余量，四笔卖出覆盖全部拆后持仓。总费用 19.36 元，平仓交易含六个成交标识，5 月 26 日结束。净交易盈亏为 15,984 − 20,000 − 19.36 = −4,035.36 元，期末净值为 1,000,000 + 100 − 4,035.36 = **996,064.64 元**。策略执行分析为 `complete`。总结果为 `partial`，原价公司行动基准返回 `BENCHMARK_RAW_ACTIONS_UNSUPPORTED`，另披露停复牌来源限制。回执为 `daily-action-replay-RjQZPH/worker.json`，结果校验和 `0c70a1b5d2b84230`。

反例只把拆后开盘改为 4.8 元，相应卖出滑点价 4.7952 不符合 0.001 价格步长。Worker 返回止损委托的卖出方向、标识和 `RULE_REJECTED / INVALID_TICK`，保留持仓。期末净值 **999,293.80 元**，总结果为 `unavailable`。回执为 `daily-action-replay-gHOwZj/worker.json`，结果校验和 `d5894795c899f39a`。

### 回放发现及修复

- 混合拆股和分红的事实行在冻结前使用各自字段，Parquet 回读按同一分区的列集合补空值。完整性校验现同时核对原始稀疏行和由预期列推导的补空表示。把拆股比例从 2 篡改为 3 仍被拒绝。
- 账本与订单已经调整拆股，平仓交易投影此前按拆前股数过早结束。投影现按已接受的同标的拆并股调整持仓周期的数量，沿用原始成交金额、费用和成交标识。
- 模拟拒单映射曾遗漏方向，导致 Worker 在输出校验时抛错。现在从产生拒绝的实际委托读取方向。反例继续执行原有价格步长校验。

## T04d.7 完整研究确认页面

复用真实编写 `authoring/full-fill.json` 中的建仓、普通退出、附属止损三张模板。为进入历史版本的研究口径确认页，单独构造来源坐标为 `run` 的历史输入，经正式研究口径投影保存为新版本；验收比对请求中的完整投影。价格表达式引用随投影切换到研究坐标。两种冻结响应均由正式 `prepareBacktestRunConfigV3` 配合受控行情和策略生成并经过正式 Schema。版本保存、提交、确认及创建由浏览器隔离接口承接。

| 页面 | 四宽下的操作与断言 | 流程数 |
| --- | --- | ---: |
| Desktop 完整 `BacktestSetupDialog` | 采用前禁用开始；核对三张模板、两根有效期、止损价格类型、父单全成激活和最低佣金；采用新版本后提交，在等待确认的回执中核对冻结政策，确认后弹窗关闭 | 8 |
| 移动端完整 `BacktestSetupScreen`，React Native Web 宿主 | 从策略库读取历史版本，采用前禁用预检；核对相同投影，采用后预检、查看冻结政策、展开／收起原始证据。首次取消确认后创建次数为零，再确认时创建请求的整份运行配置与冻结响应相等 | 8 |

两个页面分别在 1440、1024、768、390 宽度执行默认整笔和每根 100 研究单位的压力测试。各次均校验策略版本、模式、日期、初始资金、执行模型、估值和成交政策；页面无横向溢出，捕获的页面异常为零。共 16 个流程、24 张通过截图。明细见 `pages.json`、`wholeOrder.json` 和 `perBarCap.json`。保留了上一轮的版本、修改预览、结果和压力控件回执。[既有范围与历史记录](../archive/tasks/2026-11-15-backtest-trade-plans.md)

首次完整桌面流程在等待确认时能看到表单草稿，但确认区漏显服务端冻结的成交政策。现从回执读取政策、数量单位、实际来源及业务时区。移动端摘要按估值时区展示冻结时间，展开的原始凭据保留精确时间戳。桌面失败截图和日志仍在 `failure-desktop-1440-wholeOrder.png`、`browser-attempt1.log`。本批为本机源码运行的浏览器验收，真机、部署及目标队列另有各自边界。真实模型调用和真实业务写入均为零。

## 定向检查与复核命令

| 范围 | 结果 |
| --- | --- |
| Server 冻结／依赖／订单 Worker | 3 文件 21 项通过 |
| Server 旧快照及市价兼容 | 选中 2 项通过 |
| Domain 平仓交易 | 4 项通过，Domain 构建通过 |
| 页面所用正式准备响应 | 1 项通过，生成两种冻结政策 |
| Desktop 提交状态与失败反馈 | 8 项通过 |
| Mobile 冻结摘要与完整凭据 | 选中 1 项通过 |
| 类型检查、范围 lint | Domain、Server、Desktop、Mobile 均通过，10 个变更源码及测试文件 ESLint 退出 0 |

以下命令从主仓根执行。pnpm 使用 `rtk proxy env npm_config_registry=https://registry.npmmirror.com pnpm`，下文以函数代写该前缀。

```sh
p() { rtk proxy env npm_config_registry=https://registry.npmmirror.com pnpm "$@"; }
qa="$PWD/var/acceptance/t04d-freeze-confirm-20261118"
p --filter @thesis-ledger/domain build
DAILY_ACTION_REPLAY_DIR="$qa" p --filter @thesis-ledger/server exec vitest run test/backtest/{daily-order-actions-replay,daily-order-worker,backtest-snapshot-v3-dependencies}.test.ts
p --filter @thesis-ledger/server exec vitest run test/backtest/v3-runner.test.ts -t '旧快照|replays a complete'
p --filter @thesis-ledger/domain exec vitest run test/backtest-trades.test.ts
p --filter @thesis-ledger/desktop exec vitest run test/backtest-preparation-failure.ui.test.tsx src/features/strategy/use-strategy-submission.test.tsx
p --filter @thesis-ledger/mobile exec vitest run --dir test test/parity/batch4-ui.test.tsx -t 冻结概要
for pkg in domain server desktop mobile; do p --filter "@thesis-ledger/$pkg" typecheck; done
rtk proxy node_modules/.bin/eslint packages/domain/src/backtest-{daily-engine,trades}.ts apps/server/src/backtest/{backtest-v2-execution-exchange,backtest-snapshot-v3-dependency-validation}.ts apps/server/test/backtest/{daily-order-actions-replay.test,daily-order-raw-snapshot.fixture,backtest-snapshot-v3-dependencies.test}.ts apps/desktop/src/features/strategy/BacktestSubmissionFeedback.tsx apps/mobile/src/features/backtest-setup/BacktestPreparationEvidence.tsx apps/mobile/test/parity/batch4-ui.test.tsx
```

页面验收使用单独的本地宿主。运行时将私有目录内的 `prepare-page.test.ts` 放在 `apps/server/test/backtest/qa-freeze-confirm-20261118.test.ts`，将 `harness/` 放在 `apps/desktop/test/qa-freeze-confirm-20261118/`。运行结束两者均已移回回执目录，端口 5198 的宿主已关闭。

```sh
CONFIRM_QA_DIR="$qa" p --filter @thesis-ledger/server exec vitest run test/backtest/qa-freeze-confirm-20261118.test.ts
p --filter @thesis-ledger/desktop exec vite --config test/qa-freeze-confirm-20261118/vite.config.mjs
# 在另一个终端运行浏览器检查。
rtk proxy node var/acceptance/t04d-freeze-confirm-20261118/browser.cjs
```

早期夹具的路由修订和观测有效期、预期完整性误判，以及 Parquet 和拒单投影失败的日志保存在 `check1.log` 至 `check5.log`。首次移动定向命令漏加 `--dir test`，额外收集到归档副本，其中两份缺测试宿主而加载失败；源码用例当次已通过，限于正式测试目录后再验通过。原回执与历史成败均保留。T04d.8 仍需目标 Server／Worker 对新增样本及兼容对照进行正式验收。
