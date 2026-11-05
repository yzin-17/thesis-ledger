# M31 HiThink ETF 分红 DSA 事件路径接线

## 实施范围

DSA 将 `CN/ETF/CASH_DISTRIBUTION`、`hithink/fund-corporate-actions-dividends` 同时登记进事件库存、HiThink Provider manifest、Control 策略目录与鉴权事件入口。事件读取不使用其他来源回退。目录和策略的可用性以当前环境凭据 HMAC 修订、精确准入、内容寻址的 ETF 身份/分红币种原文及全部准入标的范围为条件。

`thesis_ledger_hithink_event_v3.py` 在凭据或来源读取前核验身份原文；随后核验鉴权、策略与准入，固定一次凭据快照进行有界读取，返回前重新核对原文、凭据、撤销和策略。响应保留实际 `hithink` 来源、原文证据、金额与日期及 `complete=false`。未知分红 `progress` 值仍由严格标准化器拒绝；本路径没有把 `"2"` 推断为已实施，也不把已读取区间标记为完整历史。

## 本地验证

- 合成 SQLite/HTTP 正反例及相邻事件定向测试：86 项通过；覆盖无证据、未准入、目录拒绝、成功读取、重复应用、凭据轮换、撤销、畸形 manifest、读取中策略变化、未知进度值和鉴权请求。没有使用真实 HiThink 凭据。
- 取本路径生成的合成 HTTP 响应，调用主仓已构建 Schemas `marketEventResponseV3Schema.parse` 和 Server `verifyHithinkFundIdentityV3`：协议与原文校验通过，`provider=hithink`、事实数 1、`coverage.complete=false`。
- DSA 官方 `syntax` 与关键 `flake8` 门禁退出 0；变更文件限定 lint 与 `git diff --check` 通过。
- 官方 `offline-tests` 在独立临时副本运行。副本只含当前 DSA 源码/测试、公开 `.env.example` 及主仓 Schemas 构建与 fixture，使用合成 Token/密钥和本地数据库，Python 出站 DNS/socket 守卫及失效代理；不读取宿主真实凭据。首次收集因复制排除规则误删仓库 `src/data` 源码而失败。补齐后首次完整运行 7520 passed、7 failed；其中 3 项是副本缺公开 `.env.example`，4 项是旧测试写死 HiThink 能力/事件库存集合。补齐文件并更新测试后，148 项涉及的定向复测中有 1 项遗漏的旧来源能力断言，修正后该文件 15 项通过。其余结果见下节。

## 官方离线门禁结果

唯一完整最终复试：`bash scripts/ci_gate.sh offline-tests` 退出 0，**7527 passed、1 skipped、4 deselected、626 subtests passed**，耗时 5 分 25 秒；同一隔离输入的 `syntax`、`flake8` 均退出 0。最终日志位于 `/private/tmp/cont-m31-hithink-event-gate-20260929/logs/{syntax-final,flake8-final,offline-tests-final}.log`。隔离副本仍包含非生产样例与合成数据；Python 守卫不等同容器级网络隔离，门禁脚本本身按官方配置排除 4 项网络标记测试。

## 目标容器拒绝路径

按项目入口运行相邻 infra `bash scripts/sync-code.sh all`，兼容性预检通过，宿主机 Server/workspace 构建完成，DSA、Server、Worker 重启后均 healthy；日志位于 `/private/tmp/cont-m31-hithink-event-gate-20260929/logs/sync-all.log`。三个目标镜像 ID 保持不变，本次更新只在容器可写层，容器重建会恢复镜像内代码；脚本未执行数据库结构或外部卷变更。

在目标 DSA 读取 V3 目录，精确 `hithink/fund-corporate-actions-dividends` 事件条目存在且为 `not_admitted`。确认该状态后，使用容器环境中的鉴权 Token 向运行中的 `POST /api/v3/thesis-ledger/market/events` 发送 `510300.SH` 精确请求，收到 HTTP 422、`error.code=not_admitted`；调用在准入前终止，没有向 HiThink 发出请求。未输出或复制 Token。此结果证明目标拒绝路径，不能证明真实来源正路径、Server/Worker 冻结或历史完整覆盖。

## 未完成门禁

上交所公告支持的 `510300.SH` 身份/币种候选原文已另行核对，但未写目标 Control 或签发准入；HiThink 真实响应的 `progress="2"` 语义仍无可信字典，历史事件覆盖未确认。目标鉴权 HTTP 的正路径、Server 选择、Worker 冻结与真实公告交叉核对均不能由合成通过或目标拒绝路径替代。M31-a、M31-b2-target、G0-H/G-M2-Events 和普通 Run 的完整事件门禁继续开放。
