# RQData 生产事件接线与目标拒绝验证

日期：2026-09-27。对应 `M29-b2-event-runtime` 的本地生产接线及部署拒绝子叶，复用于 M30。上一轮已完成公开原文合同及 Server 消费者；全目标保持执行中。

## 已实施

- DSA 精确库存新增 `rqdata × rqdata × CN ETF` 的现金分红与拆分两条路由，仍由当前准入门控；宽 Provider manifest 的事件能力集合保持为空，库存登记不能授予真实来源权限。
- 当前准入先检查记录状态、期限和精确适配/SDK 修订，再检查已保存账号的 HMAC 修订；缺记录不解密 RQData 账号。目录和执行读取共用判断，账号轮换不能复用旧准入。
- 生产事件入口接入原文身份/币种校验、加密账号快照、30 秒总期限的 spawn SDK 隔离读取，以及读后准入、文件、账号、策略和目录复核。请求固定单一来源，不隐式重试或改源。
- 公开响应保留身份原文和匹配准入、原事件内容修订、不完整历史覆盖；没有使用 EastMoney 日期映射代替 RQData 身份证明。拆分能力同时接受真实标准化器可能返回的 `REVERSE_SPLIT`。
- 将精确库存与宽 manifest 的目录兼容判断提取为独立职责，保留既有静态调用入口；运行时大文件从 2616 行降至 2587 行，Control 大文件仍为 3593 行。本轮未改依赖或数据库结构。

## 本地证据

| 检查 | 结果 |
| --- | --- |
| 新增生产接线 | 11 项通过，包含两种能力、合并事件、缺准入不读账号、读取期间撤销/账号轮换/策略变化/文件篡改，以及安全 HTTP 失败 |
| 事件定向组合 | 33 项通过；其中两项鉴权 HTTP 使用实际 SQLite、原文文件、实际 spawn 子进程和真实标准化器，SDK 工厂返回受控数据，未访问外部服务 |
| 完整相关回归 | 事件、身份、隔离进程、凭据、Control V3、行情准入和旧行情合同共 166 项通过；8 项既有依赖/测试收集警告 |
| DSA 到 Server | 实际受控 SQLite 生产编排输出的 cash/split 两份 exchange 均通过 Server 严格共享 Schema 和原 UTF-8 摘要重验，覆盖保持 false |
| 静态检查 | 新模块及测试 flake8、修改大文件关键错误检查、Python 编译及 diff check 通过 |

首次测试命令误用未安装 pytest 的系统 Python，改用项目 `.venv/bin/python` 后发现测试 spy 错误拦截了其他 Provider 的既有凭据查询；限定只监视 RQData 后第二次重试通过。组合回归发现旧目录断言仍仅列 EastMoney，补全两条明确未准入的 RQData 库存后第一次重试通过。lint 两处缩进修复后第一次重试通过，没有放宽门禁或忽略失败。

日志：`/private/tmp/goal-rqdata-event-runtime-directed-retry2-20260927.log`、`/private/tmp/goal-rqdata-event-runtime-regression-retry1-20260927.log`、`/private/tmp/goal-rqdata-event-runtime-lint-retry1-20260927.log`、`/private/tmp/goal-rqdata-event-runtime-contract-20260927.log`。跨仓探针：`/private/tmp/goal-rqdata-event-runtime-contract-20260927.mjs`。

## 目标运行态与未完成条件

官方 `sync-code.sh dsa` 完整退出成功，DSA healthy，六份运行源码摘要与宿主一致。镜像保持 `sha256:a9afed6adcadff81b776132790a743db90c422a1bc97fb96697ab32e47ca7b20`；本次仅更新容器可写层，不能作为不可变镜像发布证据。

目标目录存在两条 RQData 事件路由，ready 数为 0；直接查询当前准入返回缺失，RQData 账号回调数为 0。目标当前没有已应用的 V3 策略，两个实际鉴权 HTTP 请求均返回 `422 policy_not_applied`。探针首次假定策略非空而失败，改为明确支持未配置状态后第一次重试通过，没有修改目标策略、账号或准入。

日志：`/private/tmp/goal-rqdata-event-runtime-sync-20260927.log`、`/private/tmp/goal-rqdata-event-runtime-target-retry1-20260927.log`；探针：`/private/tmp/goal-rqdata-event-runtime-target-20260927.py`。

`M29-b2-event-runtime-local` 完成。父项及目标正向子叶仍开放：须在真实审核身份/币种、逐接口账号权限和目标 V3 策略/准入具备后，证明生产 HTTP 到 Server 事件消费者的正向请求。当前目标拒绝证据不能替代该正向验收，合成准入不能写入目标作为替代。完整历史事件/修订覆盖、公告交叉核验、真实冻结/记账与信号门禁另行保留在 M29/M30/M33 及 G-M2-Events。
