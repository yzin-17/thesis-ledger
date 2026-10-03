# RQData 身份原文合同与在线、离线消费证据

日期：2026-09-27。对应 `M29-b2-identity-wire`、`M29-b2-identity-consumer`，复用于 M30。全目标保持执行中，M29/M30 父项仍开放。

## 已交付范围

- Schemas 新增严格 ETF 身份映射 bundle 与 `identityEvidence: { ref, sha256, content }`。事件响应绑定精确 RQData 来源、准入摘要、证券和完整请求范围；观察时间不得晚于准入记录或冻结截点。分红要求独立币种证据，重复 JSON 字段含转义同名均拒绝。
- Server Market 拥有来源身份的执行端校验，按原始 UTF-8 字节计算摘要并限制 1 MiB，在线选择与 Backtest 离线 Snapshot 共用。原事件内容修订与身份文件摘要分别保存；语义相同的 JSON 空白变化仍构成摘要不匹配。
- 离线验证保留原始事件 exchange 与原文字节，准入有效期以原 `fetchedAt` 判断，不以当前时间重新授予准入。身份有效仍不能将不完整历史覆盖冻结为完整输入。
- 依赖方向为 Backtest 消费 Market 的来源校验；既有 `scripts/check-boundaries.mjs` 已禁止 Market 反向依赖 Backtest，本次门禁通过，无需新增重复规则。

## 本地验证

| 验证层 | 结果与输入 |
| --- | --- |
| 身份共享合同定向 | 新增 23 项，连同既有事件合同 29 项共 52 项通过 |
| Schemas 全包 | 最终 367 项通过；构建通过 |
| Server 执行与离线 | 新增 9 项；连同事件选择、拆分映射、能力规划、聚合及 Snapshot 回归共 48 项通过 |
| Server 事件传输 | 既有 9 项通过；与上行合计 57 项，不包含未运行的 Server 全包 |
| 实际 Parquet | 临时目录写入、全新 Store 读回完整证据、离线领域投影重建及原文篡改拒绝通过；来源、准入与完整覆盖均为明确合成样本 |
| 静态检查 | Server typecheck/build、定向 ESLint、模块依赖和 workspace 依赖检查、代码 diff check 通过 |

Schemas 首次构建发现 `exactOptionalPropertyTypes` 不兼容，修复后第一次重试通过。首次 lint 发现正则多余转义，第一次修复重试通过。文件尺寸检查退出成功，报告 13 项既有大文件警告且本次未提供基线，不能据此宣称全仓技术债已消除；新增文件未超过阈值。

日志：`/private/tmp/goal-rqdata-wire-directed-20260927.log`、`/private/tmp/goal-rqdata-wire-build-retry1-20260927.log`、`/private/tmp/goal-rqdata-wire-regression-final-20260927.log`、`/private/tmp/goal-rqdata-wire-final-build-20260927.log`、`/private/tmp/goal-rqdata-consumer-directed-20260927.log`、`/private/tmp/goal-rqdata-consumer-regression-20260927.log`、`/private/tmp/goal-rqdata-consumer-transport-20260927.log`、`/private/tmp/goal-rqdata-consumer-typecheck-20260927.log`、`/private/tmp/goal-rqdata-consumer-build-20260927.log`、`/private/tmp/goal-rqdata-wire-consumer-lint-retry1-20260927.log`。

## 目标运行态

官方 `sync-code.sh thesis-ledger` 完整退出成功，Server 与 Backtest Worker 均 healthy。每端五份运行代码摘要与宿主产物一致：共享身份/事件合同、Market 校验/选择器和 Snapshot 事件消费者。禁用外部请求的受控探针验证原摘要接受、缺原文拒绝、空白篡改拒绝、在线失败只读取一次，以及覆盖仍不完整。

探针首次引用旧 `/app/dist` 路径失败；核对官方同步脚本和 `/proc/1/cmdline` 后改为实际 `/app/apps/server/dist`，第一次重试通过。没有重新部署、绕过更新入口或放宽校验。

Server 与 Worker 镜像均保持 `sha256:f51e7f52e3ce141fa29517afae0005ff9c9c19d12009b0a6d8b3f4539ea49b7a`。本次更新仅在容器可写层，不能作为不可变镜像发布证据。日志：`/private/tmp/goal-rqdata-wire-consumer-sync-20260927.log`、`/private/tmp/goal-rqdata-wire-consumer-target-retry1-20260927.log`；探针：`/private/tmp/goal-rqdata-wire-consumer-target-20260927.mjs`。

## 后续条件

共享合同与 Server 消费者已具备部署证据；下一叶将 DSA 精确事件库存和生产 HTTP 入口接入已完成的身份、凭据修订与隔离读取接缝。默认无准入仍拒绝，生产响应必须携带原文且继续不完整覆盖。

真实 ETF 身份及币种审核、账号逐接口权限、独立公告交叉核验、完整历史与修订覆盖均未完成。本轮没有读取真实 RQData 凭据、调用真实 SDK 服务、保存目标准入或创建回测/AI 任务。此前重试耗尽的 I01、HiThink、目录与浏览器卡点继续按原记录跳过，不计为通过。
