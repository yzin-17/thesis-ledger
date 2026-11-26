# 竞技场采样政策的目标同步与验收

日期：2026-11-23。归属：[T06.2d](../tasks/2026-11-12-autonomous-model-arena.md)、[R4G-D](../tasks/2026-11-12-arena-replay-live.md)。复用[原采样政策本地验收](2026-11-23-arena-sampled-policy-local.md)及[深市 ETF 验收](2026-11-23-arena-sz-etf-state.md)。本文记录本次经用户“开始”授权后的目标同步及脚本必要的应用重载。

## 范围与操作结果

工作区沿用三个既有 checkout，所有修改仍未提交。没有新建 worktree 或使用子代理。真实模型及资格探针调用为零，没有创建、启动、恢复或重试比赛。原维护队列暂停归属保持，业务数据库只读；没有更改来源、凭据、路由或准入，没有提交、推送。

两次同步均从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行正式入口 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/scripts/sync-code.sh`：

| 命令 | 北京时间 | 退出结果与影响 |
| --- | --- | --- |
| `./scripts/sync-code.sh all` | 23:01:28 至 23:02:16 | 0；兼容预检、宿主产物构建、应用载荷同步及 Server／Worker／DSA 重载通过 |
| `./scripts/sync-code.sh dsa` | 23:08:58 至 23:09:06 | 0；仅同步下述策略时间比较修复并重载 DSA |

执行使用 Node.js `24.22.2`，`umask=022`；`COREPACK_NPM_REGISTRY`、`pnpm_config_registry`、`npm_config_registry` 均为 `https://registry.npmmirror.com`。没有更新镜像、依赖、数据库结构或外部卷。五个容器身份与镜像保持原值，PostgreSQL／Redis 启动时间保持原值；应用三端最终健康，Worker 心跳在本次重载后更新。快更写入容器可写层，重建容器后应由正式入口重新同步当前源码，不能将本次结果称为镜像更新。

私有完整回执位于主仓 `.recovery-artifacts/arena-sampled-deployment-20261123/`：两次 `sync-*.json`、`sync-code-*.log`、保护快照、产物比较及目标脚本均保留。回退应沿正式部署入口处理；本轮未执行回退或数据库迁移。

## 实际失败与修复

第一次正式同步成功后，目标 `trading-observation` 返回 `409 policy_changed`。目标只读连读确认策略 revision 均为 202，唯一不同字段为 `appliedAt`；该字段由 `_effective_v3` 在每次投影时重新生成。原 API 比较整个投影，导致无实际控制变化时也拒绝结果。

修复位于 DSA `api/thesis_ledger_current_trading.py`：仅排除 `appliedAt`，其他字段继续参与前后比较。真实修订、总开关、路由、来源资格或策略移除仍返回 409。`tests/test_futu_trading_state.py` 将原完整 Data HTTP 测试扩为六种投影变化情形，经过实际 SDK 字段归一化与 HTTP 入口验证。

定向命令在 DSA checkout 执行：

```sh
.venv/bin/python -m pytest -q tests/test_futu_trading_state.py tests/test_current_trading.py
.venv/bin/python -m flake8 api/thesis_ledger_current_trading.py tests/test_futu_trading_state.py --max-line-length=140
```

结果：29 项通过，flake8 退出 0。原 106 项 DSA、15 项 Server／跨语言及必要包检查的未变范围继续复用，不重复全套验收。初次 409 回执保留为 `target-consumption.stderr.first-policy-changed`。

## 目标实际消费与隔离闭环

目标 Server 容器以现有编译版本的 `DsaClient` 发起只读请求，每请求最多一次尝试，限制为现有 DSA 地址的三个 GET 入口；没有模型或比赛入口：

- 生效策略修订 202，排除动态生成时间后，实读前后控制投影一致。
- `159915.SZ`、ETF 当前状态由富途取得 `normal`；该来源只提供状态，现有同花顺报价路由保持。
- `02800.HK` 经实际报价 Schema 解析，币种 `HKD`、每手 `500` 股、资产类型 ETF；目标官方港股 ETF 价位函数可消费实际价格。

以上是收市窗口实读，证明目标来源及新入口可消费，不认证盘中成交资格，也不回填历史状态。实际原始价格未在脚本失败前输出，本文不补造价格回执。

上述实读断言通过后，隔离脚本误将保存账户的预期修订写为 0，而样本实际为 65，正确触发 `account_conflict`。这属于验证脚本输入错误，原失败保留为 `target-consumption.stderr.harness-revision-error`；改为读取样本自身修订后，仅重跑无外部请求的内存段，没有重复成功的来源请求或另行同步业务源码。

内存段在目标 Server 容器通过 `docker exec -i -w /app/apps/server … node --input-type=module -` 执行，使用目标编译的 `MarketArenaReplayReader`、`LiveExecutionContext` 和领域提交／撮合入口，输入复用已保存 588000 决策、分钟和日历。数据库、模型及其他出站端口均拒绝：

| 断言 | 实际结果 |
| --- | --- |
| 委托提交后不能按同一根采样立即成交 | 通过 |
| 后续一分钟成交 | 14,800 股，价格 1.343 |
| 配置费用、现金及净值 | 费用 0，现金 80,123.6，净值 100,000 |
| CN 买入可卖日 | 2026-11-11，来自样本实际交易日历 |
| 重复处理与冻结输入 | 不新增成交，原输入保持原值 |
| 外部调用 | 模型 0、比赛操作 0、数据库调用 0、禁止端口尝试 0 |

最终结果保留在 `target-consumption.json`，执行脚本为 `verify-target-memory.mjs`。这是目标编译版本的纯内存业务闭环，不是目标业务表写入或真实比赛运行证据。

## 产物与保护对账

复用原只读 `runtime-snapshot.mjs`、产物比较及队列身份检查；源码变化后重新核对受影响的部署范围：

- Server／Worker 各 7,158 个构建文件与宿主一致，共用 SHA-256 `4a2400fa19d3603ab266c1ce5e9904a40daa5fc9e7de93370f797c18ac433713`。
- DSA 642 个运行文件与宿主一致，最终 SHA-256 `5bfba75c5f24a6631ba3974fde496d51c7d8b37a85071bf3df4c7af26c464e1e`。
- 11 张受保护业务表的行数及内容摘要与同步前完全相同；资格验证回执仍为 113，没有新增模型消费。
- 4 张来源控制表的行数及摘要完全相同，包括策略、策略历史、路由准入与提供方配置。
- 原队列 `paused=true`、暂停持有者相同、`active=0`；唯一待处理任务与 PostgreSQL 原周期身份一致，未释放暂停、未消费待处理比赛。
- 结构 head 保持 `20261114010000_journal_period_review_snapshots`；Server／Worker／DSA、PostgreSQL／Redis 均健康，Worker 心跳在本轮启动后且检查时新鲜。

最终回执：`artifact-parity-final.json`、`guard-final.json`、`source-control-final.json`、`queue-final.json`、`health-final.txt`。检查只读，不向业务或控制表写入测试数据。

## 一致性结论与未验收边界

T06.2d／R4G-D 的正式同步、目标实际来源消费、目标编译版本隔离业务闭环及保护对账通过。本批 T06.2 源码收敛、沪深港成功入口与统一政策可以交付。原本地复盘 R01～R07／D01／D02 的未变检查继续有效；本次暴露的动态时间误判已定向修复并验证。

G03 的美股盘中执行门禁仍未验收，遵循用户已停止开市等待的决定，不恢复等待。真实模型准入、完整历史追平及远端 CI 沿原任务保持独立未完成；本轮不以同步或内存成功替代这些结果，不改写旧失败、旧比赛或既有证据。
