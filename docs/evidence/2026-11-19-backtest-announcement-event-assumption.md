# 股票回测按公告处理空事件的正式入口验收

2026-11-19，`600000.SH` 的两份首小时边界配置均通过本地正式联合预检。快照构建从公告目录回执生成空事件行，Worker 从冻结产物重放。公司行动无需配置测试事件提供方。[任务](../archive/tasks/2026-11-15-backtest-trade-plans.md) · [规格](../specs/2026-11-15-backtest-trade-plans.md) · [分钟来源、旧阻断与上交所查询](2026-11-19-backtest-session-futu-minute-warmup-worker.md)

## 正式入口与口径

1. 联合预检和快照构建共用事件依赖收集器。中国内地股票使用原始份额及固定供应商快照、且本次所需事件能力均无准入时，自动读取 DSA 已有的本地公告目录。已有完整事件来源继续优先。来源读取异常、控制版本不符、严格历史时点运行均保留原处理路径。
2. 目录按标的和事件窗口末日查询，包含更早披露的公告。程序核对各页并在标题、详情中匹配分红与拆并股用语。遇到可能相关的公告即要求核对生效日期与事实；单靠标题可能无法排除已在更早日期生效的旧公告。目录正常返回且未见相关记录时产生空事件行。目录异常、漏页或返回其他标的无法产生该结果。
3. 快照保存证券、窗口、目录返回页及摘要。来源标记为 `announcement-research-assumption`。Worker 校验已冻结的目录页，结果中显示“公告库未查到相关公告，本次回测按无现金分红、无拆并股处理。”这里的空值表示本次研究的记账假设。

## 输入和结果

开发 DSA 的只读 `GET /api/v3/thesis-ledger/market/announcements?symbol=600000.SH&end=2026-11-02&page=1&pageSize=100` 返回 HTTP 200、`official-states`、`total=0`、`items=[]`。读取时间为北京时间 11 月 19 日 01:38:41，响应字节 SHA-256 为 `eeb92b541d18fd8b67f57f74f9f87004dc7f444a0b6d7133b2a97883d968141f`。该调用读取本地目录。本次未再次访问上交所或富途。

两侧通过 `MarketWindowEvidenceV3Repository.findFrozen` 重开上轮同一份分钟证据行，指纹 `2b2bcdc2d952c69c156768096a7ce27fc54620a7870ece0494471369a8143f4d`，完整响应摘要 `bd61f27e5578b3dc28455b0f2795e808e9ad587bf2fbe511e26e4c8b00ab5095`。研究截止时间随公告读取更新，行情及日历、标的身份复用原回执。验证在本地工作区使用正式 Server 服务和 Worker 执行类；存储与路由修订沿用隔离环境，股票事件路由按先前只读核实的空配置重放。

| 11 月 2 日决策边界（北京时间） | 联合预检 | Worker 成交 | 拒单 |
| --- | --- | --- | ---: |
| 第 60 分钟，10:30 | `ready`，0 诊断 | 10:31 以 10.18 元买入 24,500 股 | 0 |
| 第 61 分钟，10:31 | `ready`，0 诊断 | 0 笔 | 0 |

每侧均经过策略准备、联合预检、冻结配置复用、创建守卫、Parquet 冻结及两次完整 Worker 回放。核对预检和冻结各查询一次公告；从 Parquet 读回的证券、窗口和目录返回页与输入一致，冻结后禁用公告读取。每侧两次完整结果深比较相等。保留既有基准及停复牌披露，结果完整性为 `partial`。

## 验证与留存

私有目录为 `var/acceptance/t04e-announcement-entry-20261119-n5JsiK/`。`announcement-capture.json` 为开发 DSA 实际响应；`joint-60.json`、`joint-61.json`、`frozen-announcement-*.json` 和 `worker-*.json` 分别保存正式联合预检、快照读回及 Worker 结果。验收脚本向隔离依赖提供原样的目录响应，两次 Worker 回放均在本地完成。

在 ThesisLedger 根目录执行以下命令。定向测试覆盖已有事件优先、公告无关、第二页出现候选、标的／页数篡改、读取错误和严格时点。

```sh
A=var/acceptance/t04e-announcement-entry-20261119-n5JsiK
rtk proxy pnpm exec vitest run --testTimeout=30000 -c "$A/vitest.config.mts" "$A/replay.test.ts"
rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-announcement-events.test.ts test/backtest/backtest-snapshot-v3-dependencies.test.ts test/backtest/backtest-preflight-v3-dependencies.test.ts test/backtest/backtest-event-observations-v3.test.ts test/backtest/backtest-run-preflight.test.ts test/backtest/v3-runner.test.ts
rtk proxy pnpm --filter @thesis-ledger/server typecheck
rtk proxy pnpm exec eslint apps/server/src/backtest/{backtest-announcement-events,backtest-snapshot-v3-events,backtest-snapshot-v3-dependency-error,backtest-preflight-v3-dependencies,backtest-snapshot-v3-dependency-collector,backtest-v3-runner}.ts apps/server/test/backtest/backtest-announcement-events.test.ts
```

定向 6 文件 51 例、真实窗口两侧验收、Server 类型检查及改动文件 lint 通过。首次整窗回放触及测试工具默认 5 秒超时，定向验收使用 30 秒上限，业务逻辑及判断条件相同。旧回执保留。ATR、部署、提交和推送均未执行。

## Server 和 Worker 快更后的目标验收

2026-11-19 从 infra 正式入口快更 `thesis-ledger`，退出码 0。两容器重启后均为 healthy；各容器中的 Server、Domain、Schemas、Shared 产物已替换，镜像 ID 保持原值。本次更新位于容器可写层。验收前后 DSA、PostgreSQL 和 Redis 持续运行。

| 目标容器 | 联合预检，第 60／61 分钟 | 第 60 分钟的 Worker 结果 | 第 61 分钟的 Worker 结果 |
| --- | --- | --- | --- |
| Server | 两次均 `ready`，0 诊断 | 北京时间 10:31 以 10.18 元买入 24,500 股 | 零成交、零拒单 |
| Worker | 两次均 `ready`，0 诊断 | 相同买入，零拒单 | 零成交、零拒单 |

**联合预检。** 在两容器中分别调用部署产物的 `BacktestRunPreflightService.check` 及创建守卫。每个样本经目标 `MarketWindowEvidenceV3Repository.findFrozen` 校验并重开同一富途窗口，实读 2,640 根分钟。策略版本、行情控制修订、日历及标的身份使用原隔离样本。冻结输入的修订为 1；两容器另行实读开发 DSA 的生效修订 202，核实两类股票事件路由均缺失。预检按冻结修订和已核对的空事件路由执行。四次预检均通过目标 `DsaClient.get` 实际查询 DSA 本地目录，各收到一次 `official-states` 的 `total=0, items=[]`。每次返回的准备凭据与原样本深比较一致。该层验证目标服务类的行为，未通过业务 HTTP 创建策略或投递任务。

**Worker 回放。** 按内容哈希配对两份 finalized 快照。两个容器各对两份快照执行两遍正式 `LocalSnapshotV3Runner`，共八次。各自两遍的完整结果相同，并与快更前同一输入的完整结果一致。第 60／61 分钟的结果校验值分别为 `4c9d5a47b29191b0` 和 `b65762a437d4c679`。结果保留公告无匹配时按无现金分红、无拆并股处理的披露。通用回放检查核对 141 个构建文件；联合预检另核对 8 个直接相关的 Server 文件，两容器均与宿主构建一致。

私有回执位于 `var/acceptance/t04e-announcement-target-20261119-xvjvlo/`。`sync.log`、`before.txt`、`after.txt` 记录快更及健康状态；`sources.json` 记录快照来源；`joint-thesis-ledger.json`、`joint-backtest-worker.json` 保存真实目录响应及完整预检结果；`runtime/receipt.json` 保存两容器的模块摘要和 Worker 回放对照。

```sh
# 在 thesis-ledger-infra 根目录执行
APP="$(cd ../thesis-ledger && pwd)"
A="$APP/var/acceptance/t04e-announcement-target-20261119-xvjvlo"
rtk proxy ./scripts/sync-code.sh thesis-ledger
rtk proxy node scripts/infra.mjs locked --idle -- node "$APP/scripts/local-runtime/run-backtest-trade-plan-runtime-check.mjs" "$A/runtime" "$A:minute-sixty" "$A:minute-sixty-one"
# 在私有回执目录执行目标容器只读预检
rtk proxy python3 run-joint.py thesis-ledger
rtk proxy python3 run-joint.py backtest-worker
```

以上命令均退出 0。回放只在容器内使用临时目录，结束时清理。未重跑 ATR，未请求模型或富途、启用路由、提交或推送。
