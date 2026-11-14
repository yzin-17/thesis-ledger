# 截断诊断补丁本地部署与无模型调用验证

## 授权与范围

用户明确要求部署诊断补丁到本地，同时禁止调用模型或重试比赛。沿用[离线补丁](2026-11-14-arena-truncated-output-diagnostics.md)的验证结果，本次只执行正式快更和只读／纯内存目标检查，不做真实模型验收、研究恢复或配置变更。

## 实际入口

工作目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。

1. 只读确认三场比赛均无活动研究，Arena 队列未暂停且无活动／等待任务；`AiRun` 全为终态，没有排队或运行中的研究。
2. 通过 `node scripts/infra.mjs locked -- node <主仓>/scripts/local-runtime/arena-maintenance-queue.mjs pause <私有归属回执>` 暂停新领取。正式命令退出 0，活动／等待数均为 0，没有取消在途请求。私有回执：`.recovery-artifacts/arena-diagnostics-deployment-20261114/queue-owner.json`。
3. 执行 `PATH="/Users/yzin/.docker/bin:/Users/yzin/.volta/bin:$PATH" ./scripts/sync-code.sh thesis-ledger`，日志 `/tmp/arena-diagnostic-deploy-20261114.log`。兼容性预检通过，正式命令退出 0，宿主构建及 Server／Worker 替换、重启和健康等待完成。未修改依赖、数据库结构或外部卷，未触发完整镜像更新。
4. 核对队列仍为空后，经相同正式持锁入口及原私有归属执行 `resume`，退出 0。只恢复本次拥有的暂停，没有调用比赛启动／重试接口。
5. 恢复后额外等待 35 秒，再重复读取业务摘要与调用记录；最终检查时间为北京时间 2026-11-14 22:07 左右。

## 目标产物与健康

Server 与 Worker 使用同一镜像 `sha256:145d6f91a4ef7c3eaac801f26c89ac42fa446ccfb24c54ff67c03d8b87f0e4c2`。正式快更验证镜像 ID 保持不变，两服务均为 `healthy`；Server 于 `2026-11-14T14:03:28.163548505Z`、Worker 于 `2026-11-14T14:03:27.971224005Z` 重启。DSA 未更新或重启，保持健康。

以下文件在 Server、Worker 中分别校验，均与本次宿主构建产物的 SHA-256 一致：

| 产物 | SHA-256 |
| --- | --- |
| `server/ai/ai-generation-finished-output.js` | `5c59c1a182933eb68436bc4f2134ed29c0843874986f664cc17b718c2e65ae54` |
| `server/ai/ai-sdk-generation.adapter.js` | `0cfcd7ea95a4161f8a1c099e2b2fdabb23e6b6ad1d9a3bccb626ad91eef08059` |
| `server/ai/ai-generation-failure-diagnostics.js` | `b19fb4834126439acf9c2733dfae217c9f4908caf76cc5d0ccaeaa4474239c6d` |
| `schemas/ai-generation-error.js` | `061ce4c9aa6419907e18b3457eaab9175dc96776385fd6e958a0d608c127b02a` |
| `schemas/ai-generation-output-evidence.js` | `6703725dd49bf293a515060a50c8d9b6432fc854be436b498552f656b10d6960` |

两容器分别导入实际部署的 helper 与 Schemas，对纯内存合成响应执行检查：结束原因为 `length`、空正文、明确推理用量 99、重复段落 3 次。结果均保持 `output_truncated`，正文状态为 `empty`，推理分项和重复统计正确。没有使用 SDK 生成入口、访问模型网络、写入文件或业务数据库。

重启后的 Server／Worker 日志未发现实际 ERROR 级异常、模块缺失、语法或缺表错误。路由注册中名为 `daily-error` 的正常 LOG 不计作运行错误。

## 无新增调用与业务记录保留

更新前、更新后队列仍暂停时、恢复队列并额外观察后，三次业务快照完全相同。比较包含比赛状态、时间线、协议摘要、全部参赛者账户摘要及周期／调用审计摘要，不包含正常变化的估值帧列表。

| 对象 | 周期数：前 → 后 | 模型调用记录数：前 → 后 |
| --- | ---: | ---: |
| 历史回放比赛 `6f41c462-176a-4d6f-957e-331015e2af0f` | 63 → 63 | 143 → 143 |
| 美股比赛 `91d6e8f0-fcef-4801-ab09-f9c90110479f` | 18 → 18 | 50 → 50 |
| 原 `test` 比赛 `a36c2d69-1731-41fe-8750-86f89a236762` | 0 → 0 | 0 → 0 |

历史回放的最新周期仍为 `7e155817-ccfc-45bc-b812-01d9b8906beb`，失败记录与 `needs_attention/model_output_invalid` 保留；游标仍为 11 月 10 日 11:30，研究屏障为 13:01。原 `test` 仍暂停。所有账户与周期摘要一致，没有提交委托、成交或预约。

`AiRun` 始终为成功 25、失败 29、取消 1；`AiInvocation` 保持 1，`AiInvocationFact` 保持 2。最终 Arena 队列无维护暂停、无活动／等待任务、无遗留维护归属。

## 结论与限制

诊断补丁已通过正式入口部署到本地 Server／Worker，健康、产物一致性、目标纯内存诊断与无新增调用检查通过。没有模型调用、比赛重试或提供方设置变更，也没有提交 Git。

本次是容器可写层代码快更，不是镜像发布；容器重建会恢复镜像内版本，需要重新同步或正式构建镜像。没有制造真实失败请求来认证新增数据库审计行，因此不能把本次结果提升为真实模型循环已修复或历史回放已追平。旧失败审计不回写，继续保留当时证据。
