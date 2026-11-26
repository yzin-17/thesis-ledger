# 日线整笔撮合与三入口原生生成复验

**T04d.6b 累计 24／24 通过。** 三入口各 8／8。复用历史 11 份，本轮实测补齐 13 份，最终正式生成入口再次读取全部 24 份原始响应。

## 运行口径与兼容性

新建日线委托回测默认冻结 `liquidity.kind=wholeOrder`。只有价格满足、整单余量可付或可售且符合交易单位时才成交。数量不足的有效单可以在后续撮合时继续等待，按自身有效期到期。撮合继续使用冻结的滑点、费用、现金、交收和父单归属。开盘成交的保护从当根后续区间可用，区间成交的保护从下一根可用。实际市场规则拒单仍留拒单事件。

手动开启成交能力压力测试后填写每账户、每标的、每根的总上限。这里的上限是研究者设定的情景参数。日线成交量不用于估计真实排队位置。历史 `unlimited` 和 `perBarCap` 直接按冻结值回放。相同的 27 股委托、仅可付 26 股时，整笔模式成交 0 股，历史不限额模式成交 26 股，将压力上限设为 10 股时成交 10 股。

整笔模式的成交结果页按实际父单动作回读。两种激活方式在建仓单上都读作“建仓成交后保护”，加仓阶段读作“加仓成交后保护”。双端创建表单默认关闭压力测试，关闭后提交的运行配置不含压力数量。策略定义、旧快照、模型 v5 合同及四对原始自然语言用例仍按原值判定。

## 定向离线验证

在主仓执行下列命令，pnpm 使用已有依赖及 `rtk proxy env npm_config_registry=https://registry.npmmirror.com` 前缀。

```sh
pnpm --filter @thesis-ledger/schemas build
pnpm --filter @thesis-ledger/domain build
pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-daily-orders.test.ts test/backtest-daily-order-combinations.test.ts
pnpm --filter @thesis-ledger/domain exec vitest run test/backtest-daily-ledger.test.ts test/backtest-daily-matching.test.ts test/backtest-daily-order-result-display.test.ts
pnpm --filter @thesis-ledger/server exec vitest run test/backtest/daily-order-worker.test.ts test/backtest/daily-order-generation-contract.test.ts
pnpm --filter @thesis-ledger/mobile exec vitest run --dir test test/parity/batch4-state.test.ts
pnpm --filter @thesis-ledger/server typecheck
pnpm --filter @thesis-ledger/desktop typecheck
pnpm --filter @thesis-ledger/mobile typecheck
pnpm exec eslint packages/schemas/src/backtest-daily-orders.ts packages/domain/src/{backtest-order-contract,backtest-daily-matching,backtest-daily-order-settings,backtest-daily-order-result-display}.ts packages/domain/test/{backtest-daily-ledger,backtest-daily-matching,backtest-daily-order-result-display}.test.ts apps/server/test/backtest/daily-order-worker.test.ts apps/desktop/src/features/strategy/{BacktestDailyMatching,BacktestDailyOrders}.tsx apps/mobile/src/features/backtest-results/BacktestDailyOrders.tsx apps/mobile/src/features/backtest-setup/{BacktestDailyMatchingFields.tsx,backtest-intent.ts} apps/mobile/test/parity/batch4-state.test.ts
rtk proxy node var/acceptance/backtest-whole-order-ui-20261118/browser.cjs
```

最终定向命令分别通过 Schemas 37 例、Domain 26 例、Server 13 例、Mobile 7 例。三端类型检查和受影响文件 lint 退出 0。lint 对依赖内 React Native Flow 语法打印解析诊断。最初 Mobile 测试扫描到存档夹具，显式限定正式测试目录后通过。两种激活方式各用一份整笔冻结 Worker 样本，得到 5 月 19 日一次完整买入、20 日同量卖出，重复回放完整结果相等。

浏览器运行实际 Desktop 和 React Native Web 表单组件，分别验证 1440、1024、768、390 四种宽度，开启压力、输入数量、关闭压力与横向溢出；另验 Desktop 390 宽可选开关。九项通过。首次发现的 Desktop 开关零尺寸和描述脱离 Field 的问题已修复。日志、八张截图、报告和临时宿主归集于 `var/acceptance/backtest-whole-order-ui-20261118/`；可将其中 harness 复制到 `apps/desktop/test/qa-whole-mey3vqx4`，使用 Desktop 的 `vite --config test/ratio-display.vite.config.mjs --port 5197` 复现。本批移动结果来自浏览器宿主，原生真机及完整研究确认页面仍沿用 Task 独立验收范围。

## 目标模型与回执

复用[上一轮十一份通过回执](2026-11-18-backtest-daily-order-remaining-matrix.md)。本轮使用相同 v5、模型和 Provider 设置，编写／修改提示 v25、发现提示 v12。继续通过原正式隔离脚本执行原来的压力上限样本，按实际响应、结构、意图、保存、冻结 Worker、完整回放和中文逐项判定。发现入口的原始自然语言由受控实验追加。单个场景一次业务生成，每批另有一次私有格式探针。

开发 Docker 最初停机，首次维护锁检查未发送模型请求。Docker 按正式入口启动后，依用户授权原样恢复 PostgreSQL、Redis、DSA、Server 和 Worker 五个既有服务，恢复命令报告 healthy。实测在独立数据库中运行。

```sh
# 在相邻 thesis-ledger-infra 仓库
rtk proxy ./scripts/docker-desktop.sh start
rtk proxy node scripts/resume-existing-development.mjs --confirm=thesis-ledger-dev
rtk proxy env npm_config_registry=https://registry.npmmirror.com BACKTEST_PLAN_ENTRY=<入口> BACKTEST_PLAN_SCENARIO=daily-orders BACKTEST_PLAN_CASES=<场景列表> node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs ../thesis-ledger/var/acceptance/whole-order-model-20261118/<批次>
```

本轮原始请求、响应、配置、冻结快照、回放和进程日志位于 `var/acceptance/whole-order-model-20261118/`。修改 two-bars 仅改变建仓单的有效期，普通退出仍为 DAY、止损仍为持仓期有效；发现 limit 的标准两单与冷却配置通过。下表逐项列出最终采用的正式回执。

发现 v12 的 touch 虽输出三张单，但第一张 id=entry 的 action 是 stopLoss，parent 引用了自己，同时多出 10% 收盘保护。生成入口拒绝。发现 v13 在原有提示内明确首单动作、买单与保护单分别持有的字段，以及触价保护与收盘计划的边界。编写 v25 的 close 给出了正确的收盘保护和两张委托，但将入场写成 1 等于 1，持仓后也成立，语义验收失败。编写 v26 明确空仓与已持仓两种状态下的布尔结果。以上修复均只调整正式提示和提示版本号。

对新提示运行 Server 的 `test/strategy-optimization/strategy-optimization-discovery.test.ts`、`test/strategy-authoring/authoring-prompt.test.ts`，分别搭配 `test/backtest/daily-order-generation-contract.test.ts`，16 项与 9 项通过。两次 Server typecheck 与涉及文件 eslint 均退出 0。

对本轮真实请求的三个完整出站 Draft-7 按下列命令转换。固定上游 llama.cpp 提交为 `6569fa868d43592f805530e595950570f9f5e404`，本地转换器 SHA256 为 `8a810d400da0fe9b4312d54cc3cf4a8ca94869fd874c997894e5dc7ea6e55bfd`。发现、编写和修改均生成 `item ("," space item)+` 的数组语法，允许第二张后的逗号。三项以上的真实止损输出另有正式回执。从各实际 GBNF 的重复项继续遍历规则引用，均可达 entry、exit、stage、stopLoss、takeProfit。修复前后的精简角色对照见[原离线证据](2026-11-18-backtest-daily-order-native-append-offline.md)。本地转换器的提交号与目标 LM Studio 的构建号分别记录，后者仍未知。

```sh
rtk proxy python3 var/acceptance/whole-order-model-20261118/grammar.py
rtk proxy node var/acceptance/whole-order-model-20261118/review.cjs
```

发现 v13 的 touch 已通过。each-fill 的原始说明能复述固定价和按量保护，但策略省略 execution，另添收盘保护和亏损暂停。full-fill 也将固定价误作比例并遗漏普通退出。发现 v14 说明省略 execution 的真实执行后果，区分全平等待和亏损暂停。v14 的 day 通过；two-bars 的委托角色正确，但实际止损价写成 0.9，还附送百分比收盘保护。

发现 v15 仅对原生提示精简交易计划示例，举不同价位说明固定模拟价逐字保留。each-fill、full-fill、two-bars 均写出三张委托及固定价 9，却都选择了未要求的 riskBudget 和收盘保护。v16 加入与验收输入数值不同的普通权益仓位与等待计划样例，区分“按权益投入”和“用损失预算反推数量”。编写 v26 的 close、two-bars 均改为以未持仓判断入场，两份独立回执通过。12 至 16 是发现提示版本，25、26 是编写提示版本。

## 工作区写集

| 部位 | 文件 |
| --- | --- |
| 冻结运行合同与撮合 | `packages/schemas/src/backtest-daily-orders.ts`、`packages/domain/src/backtest-order-contract.ts`、`packages/domain/src/backtest-daily-matching.ts` |
| 运行政策与订单结果中文 | `packages/domain/src/backtest-daily-order-settings.ts`、`packages/domain/src/backtest-daily-order-result-display.ts` |
| Desktop 与 Mobile | `apps/desktop/src/features/strategy/{BacktestDailyMatching,BacktestDailyOrders}.tsx`、`apps/mobile/src/features/backtest-setup/{BacktestDailyMatchingFields.tsx,backtest-intent.ts}`、`apps/mobile/src/features/backtest-results/BacktestDailyOrders.tsx` |
| 整笔回归 | `packages/domain/test/{backtest-daily-ledger,backtest-daily-matching,backtest-daily-order-result-display}.test.ts`、`apps/server/test/backtest/daily-order-worker.test.ts`、`apps/mobile/test/parity/batch4-state.test.ts` |
| 三入口业务提示 | 沿用工作区已调整的 `packages/domain/src/backtest-daily-order-prompt.ts` 和发现价格说明。后续修正在 `apps/server/src/strategy-optimization/{strategy-optimization-discovery,strategy-optimization-prompt}.ts`、`apps/server/src/strategy-authoring/authoring-prompt.ts` |
| 规格与回执 | `docs/specs/2026-11-15-backtest-trade-plans.md`、`docs/tasks/2026-11-15-backtest-trade-plans.md`、本报告 |

旧回执及精简角色转换资料保留在各自的原位置。本轮仅恢复五个既有服务，目标容器运行的是原有代码。验收业务对象写入隔离库。

## 最终实测矩阵

| 入口 | 场景 | 本批通过／尝试 | 探针＋业务 |
| --- | --- | ---: | ---: |
| authoring-modification · modify | two-bars | 1／1 | 1＋1 |
| discovery · discovery-a | limit, market, touch, close | 3／4 | 1＋4 |
| authoring · authoring | close, full-fill, day, two-bars | 2／4 | 1＋4 |
| discovery · discovery-protection | touch, each-fill, full-fill | 1／3 | 1＋3 |
| discovery · discovery-validity | day, two-bars | 1／2 | 1＋2 |
| authoring · authoring-entry | close, two-bars | 2／2 | 1＋2 |
| discovery · discovery-prices | each-fill, full-fill, two-bars | 0／3 | 1＋3 |
| discovery · discovery-sizing | each-fill, full-fill, two-bars | 3／3 | 1＋3 |

| 场景 | 发现 | 编写 | 局部修改 |
| --- | --- | --- | --- |
| limit | discovery-a | 旧·authoring-a | 旧·modification |
| market | discovery-a | 旧·authoring-a | 旧·schema-modification |
| touch | discovery-protection | 旧·authoring-a | 旧·each-fill-touch |
| close | discovery-a | authoring-entry | 旧·close |
| each-fill | discovery-sizing | 旧·authoring-b | 旧·each-fill-touch |
| full-fill | discovery-sizing | authoring | 旧·full-fill |
| day | discovery-validity | authoring | 旧·schema-modification |
| two-bars | discovery-sizing | authoring-entry | modify |


“旧”指上一轮已验收的原始响应、保存版本、冻结 Worker、回放与中文回执。新增的 13 个位置各自有独立生成及保存回执。发现 each-fill 和 two-bars 的自然语言文本相同，分别按原样实测，两份回执独立计数。

本轮共 30 个实际出站请求，含 8 次格式探针、22 次业务生成。批次退出码按上表顺序为 0、1、1、1、1、0、1、0。发现 8 个待验位置首次通过 4 个，编写 4 个首次通过 2 个，修改 1 个首次通过 1 个，合计首次通过 7／13。追加调用只覆盖失败位置。两次原始 Schema 拒绝及七次合法结构偏离均原样保存。24／24 是分批累计覆盖，单轮稳定性仍按首次结果评估。

- 标准 Draft-7 对本轮 22 份实际业务 JSON 接受 20 份、拒绝 2 份。应用生成入口收到的两份错误角色响应均被拒绝。另有 7 份结构合法但偏离自然语言，由原验收判错。13 份同时通过生成、意图、隔离保存重读、冻结 Worker、重复回放和中文。
- 将累计 24 个通过位置的 wire-output 逐份送入最终三入口 generationOutput，标准 Schema 和应用 parseCompleteOutput 全部通过，解析结果与各操作原 Schema 一致。每个回执的保存版本 ID、回放相等和两个空问题清单均核对。整个重放不调用模型。
- 三份完整 Schema 的固定上游 grammar 均通过。研究者设定的每根压力上限保留了 eachFill／fullFill 的可观察差别。整笔模式另有冻结 Worker 对照，两个激活策略均只针对一次实际买入建立保护。
- 消息与原生 Schema 的输入预留记录为 26,159～59,425（既有 generationInputBytes 口径）；实际报告用量可查各业务响应，其中 20 个成功解析出生成对象的业务请求汇总在 review.json。八批去凭证 Provider 行与结束后只读查询的开发库记录深相等，隔离测试容器余数为零。

在主仓复核所用命令如下。临时测试源随私有回执保存在 final-accepted-replay.test.ts，运行时复制至 Server 的 test/backtest，结束后移出源码目录。

```sh
rtk proxy env BACKTEST_ACCEPTED_COUNT=24 npm_config_registry=https://registry.npmmirror.com pnpm --filter @thesis-ledger/server exec vitest run test/backtest/whole-order-final-accepted-replay.test.ts
rtk proxy python3 var/acceptance/whole-order-model-20261118/matrix.py
rtk proxy node var/acceptance/whole-order-model-20261118/preservation.mjs
```

T04d.5c 的费用／公司行动矩阵、T04d.7 的完整研究确认页面、T04d.8 的目标部署运行态、文本预算与正则穿透、历史 ATR 失败继续按原 Task 追踪。
