# 日线委托剩余二十个场景实测

复用[修改入口的四份通过回执](2026-11-18-backtest-daily-order-native-append-model-recheck.md)，覆盖 touch、close、each-fill 和 full-fill。新增授权覆盖发现和编写各八个场景、修改入口剩余四个场景，以及失败定位、修复和定向复验。

首轮使用正式隔离数据库和维护锁，沿用 v5 原生合同及实际 Provider 配置。在相邻 thesis-ledger-infra 仓库执行以下命令模板。每批的完整参数、进程退出码、日志和原始回执保存在主仓 `var/acceptance/backtest-daily-orders-remaining20-20261118/`。

```sh
rtk proxy env npm_config_registry=https://registry.npmmirror.com BACKTEST_PLAN_ENTRY=<入口> BACKTEST_PLAN_SCENARIO=daily-orders BACKTEST_PLAN_CASES=<场景> node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs ../thesis-ledger/var/acceptance/backtest-daily-orders-remaining20-20261118/<批次>
```

发现和编写分别以 limit,market,touch,close 及 each-fill,full-fill,day,two-bars 分两批。修改仅运行 limit,market,day,two-bars。发现入口的自然语言需求为既有受控实验输入。首轮五批均已结束。

## 首轮结果与修复

首轮五批实际发送 25 次请求，各含一个格式探针。发现 0／8、编写 4／8（limit、market、touch、each-fill）、修改 1／4（limit）通过。本轮起点为 5 个新增通过和 4 个复用通过。五个进程均退出 1，逐项结果依据各自 receipt，失败回执保留。

发现 limit 的原始比较常量为空，full-fill 含非法十进制串。market 的合法配置增加均线交叉。touch 和 close 等样本缺第二张普通退出。编写 full-fill 给唯一止损填入 exitGroup；day、two-bars 缺普通退出并生成单腿退出组；close 将普通退出写为触发止损。修改 market 改成普通开盘市价模式，day 截断，two-bars 将买单的两根有效期复制给普通退出。

第一版定向实验只作用于原生生成 Schema。保持十进制合法值集合，将已知十进制约束投影为捕获组和 ASCII 数字类。对两、三、四项使用完整定长分支表达顺序，五项及以上保留可扩展分支与正式入口顺序校验。唯一附属单不能构成退出组，在三项分支省略 exitGroup。范围外冻结的历史数组继续按原样校验。

正式三入口 Schema、构造矩阵和 48 个旧位置的回归均通过。命令如下，使用现有依赖与 npmmirror 配置。

```sh
BACKTEST_DAILY_ORDER_CAPTURE_ROOT="$PWD/var/acceptance" BACKTEST_DAILY_APPEND_EVIDENCE_DIR="$PWD/var/acceptance/backtest-daily-orders-remaining20-20261118/final-schemas" pnpm --filter @thesis-ledger/server exec vitest run test/backtest/daily-order-native-append.test.ts test/backtest/daily-order-generation-contract.test.ts test/ai/ai-native-strategy-schema.test.ts
pnpm --filter @thesis-ledger/server typecheck
pnpm exec eslint apps/server/src/ai/ai-generation-json-schema.ts apps/server/src/ai/ai-generation-order-slots.ts apps/server/test/backtest/daily-order-native-append.test.ts apps/server/test/ai/ai-native-strategy-schema.test.ts
```

上述定向测试 15／15；类型检查和受影响文件 lint 退出 0（分两次检查）。完整业务 Schema 分别经上一轮固定版本的上游 Python 转换器离线转换，三份均退出 0。输入和 GBNF 位于 final-schemas。与旧版本对相同三份完整输入因非捕获组报错的记录并存。仅失败位置使用新的 schema-discovery-a、schema-discovery-b、schema-authoring、schema-modification 批次复验。

首轮原始出站 Schema 独立复核使用 `node var/acceptance/backtest-daily-orders-remaining20-20261118/review.cjs`。20 个位置中 10 个通过标准校验，9 个被标准校验拒绝，1 个响应截断。逐份对照原批次的出站消息摘要、模型及 Provider settings 均相等。复验新 Schema 时，重放上述 5 个通过位置与先前四份回执，用正式 generationOutput 的 responseFormat 和 parseCompleteOutput 验证，9 份均通过。复核源码保存在同目录 accepted-replay.test.ts。

## 余下意图偏差的输入证据

发现 market 的 reason 写明仅空仓入场和恒假退出，首轮策略却以 EMA 交叉同时控制入场和退出。其实际 system 消息含交叉方向、条件 RSI／ATR 等多组能力示例，原生请求的第一条用户消息是探索目标，第二条才是场景的自然语言输入。发现 touch 的 reason 已将“本次模拟计价的9”写成 9% 止损。价格口径说明对真实报价要求转换证据，委托合同则允许冻结执行坐标下的常量；现有消息没有在同处交代两者的适用条件。编写 close 首轮将普通退出模板写成 stopMarket；修改 two-bars 两轮都把买单期限也写给普通退出。

后续可审查的提示调整范围为：在真实发现、编写入口分别说明入场信号与委托价格的职责，区分以模拟执行单位给出的固定价与相对比例，明确每张单独立持有其期限和父单激活条件。保留冻结价格坐标及真实报价转换要求。待业务提示词范围确认后，使用相同自然语言输入、模型、路由、额度、正式校验与冻结样本定向对照。

## 目标服务复验与保留的实现

短元组实验实际复验 14 个失败位置，9 个出站请求属于发现两批的探针或业务请求（其中 discovery-b 到达清理预留窗口，two-bars 未启动），另有编写和修改两批。修改 market、day 新增通过。发现 limit 生成六张单，close 及编写 close 各生成五张单，发现 each-fill 生成 102 张，多处重复 id 和动作，均被正式入口拒绝。可变长分支允许错误前缀在后续补到五项以上，短元组实验对未请求委托产生了不利影响。

已撤回按长度枚举并以五项为下限的解码分支。保留外层五角色联合及原有标准槽位顺序约束，给最多三项的数组增加单腿退出组禁令，并保留等价十进制正则投影。最终代码在 retained-schemas 取得三个正式入口的完整业务 Schema，并用同一固定版本转换器生成 GBNF，全部退出 0。原生／文本／历史冻结及当前真实回执的七文件定向检查 43／43、Server 类型检查和四个源码／测试文件 lint 全部通过。未修改模型、参数、原生 v5 合同版本和验收判定。短元组实验的代码及实际回执随私有证据保存。

## 最终矩阵与检查点

实际跑完二十个新位置并逐一定位失败。首轮新增通过 5 个位置，修复期间新增通过修改 market 与 day，复用先前 4 个位置。累计 11／24。下表标注每个通过回执或最近一次失败的批次。两个阶段的实验样本与最终保留代码的样本分别列名；全部通过样本另外用最终正式 Schema 与生成入口重放。发现仍按受控自然语言补充的既有边界归档。

| 场景 | 发现 | 编写 | 修改 |
| --- | --- | --- | --- |
| limit | 失败 · 阶段或平仓等待不符（retained-discovery） | 通过（authoring-a） | 通过（modification） |
| market | 失败 · 入场不是仅空仓、阶段或平仓等待不符（schema-discovery-a） | 通过（authoring-a） | 通过（schema-modification） |
| touch | 失败 · ATR 阶段必须声明冻结入场 ATR（schema-discovery-a） | 通过（authoring-a） | 通过（复用） |
| close | 失败 · 日线委托须明确建仓和普通退出模板（retained-discovery） | 失败 · 擅加附属保护（retained-authoring） | 通过（复用） |
| each-fill | 失败 · ATR 阶段必须声明冻结入场 ATR、日线委托须明确建仓和普通退出模板（retained-activation） | 通过（authoring-b） | 通过（复用） |
| full-fill | 失败 · 日线委托须明确建仓和普通退出模板（retained-activation） | 失败 · 买单类型或价格不符（schema-authoring） | 通过（复用） |
| day | 失败 · 日线委托须明确建仓和普通退出模板（retained-validity） | 失败 · 阶段或平仓等待不符（schema-authoring） | 通过（schema-modification） |
| two-bars | 失败 · ATR 阶段必须声明冻结入场 ATR、日线委托须明确建仓和普通退出模板（retained-validity） | 失败 · 退出组 group_1 必须为同父单、同激活方式的一条止损和一条止盈（retained-authoring） | 失败 · 普通退出模板不符（schema-modification） |

通过位置 11 ／24。新增实际请求 55 次，出站 wire 55 份。
批次退出码 [('discovery-a', 1), ('discovery-b', 1), ('authoring-a', 1), ('authoring-b', 1), ('modification', 1), ('schema-discovery-a', 1), ('schema-authoring', 1), ('schema-modification', 1), ('schema-discovery-b', 1), ('retained-discovery', 1), ('retained-authoring', 1), ('retained-activation', 1), ('retained-validity', 1)]


本次共 13 次格式探针、42 次业务请求，每次实际出站一次。最后四批在保留实现上验证发现 limit、close、each-fill、full-fill、day、two-bars 及编写 close、two-bars。其中发现 limit 完整生成正确限价单和退出单，但遗漏全平后的冷却；编写 two-bars 的三张单、买价、激活与期限符合要求，但唯一止损填写了退出组，被标准和应用校验拒绝。修改 two-bars 两次都将普通退出的 DAY 改成 bars=2。发现中也保留了将模拟价格 9 解释为百分比及生成额外 ATR 阶段的失败证据。

13 批 Provider 去凭证行与结束后真实库只读查询深比较一致，隔离测试容器余数为零。42 份业务请求的模型、Provider settings 及消息摘要逐份与对应历史样本相等。全部原始证据、实际命令与退出码分别在批次目录和对应的 -exit.json，机器复核结果为 all-attempts.json 和 preservation.json。追加的成对退出组正例在三个入口通过，补测五项、类型检查及受影响文件 lint 均退出 0。

当前 T04d.6b 未通过，发现 0／8、编写 4／8、修改 7／8。最初的修改漏保护复现及两个正反对照继续有效。下一步是针对上述真实失败调整生成端业务提示并做同输入对照；模型复验已有持续授权，业务提示调整范围待确认。交付为工作区修改，部署、提交、推送均未执行。
