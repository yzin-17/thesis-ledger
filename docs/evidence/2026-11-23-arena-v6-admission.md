# Arena v6 单次真实准入与保存验收

日期：2026-11-23。归属：[活动任务 R4D3／AC20](../tasks/2026-11-12-arena-replay-live.md)。前序[只读准备](2026-11-23-arena-v6-admission-preparation.md)完成后，用户明确回复“授权”，允许一次真实验证，通过后只保存 Arena 合同 v5→v6。此前零调用约束仅在这一次准入范围被替代，没有新增比赛操作、来源变更、部署、提交或推送授权。

## 执行范围与入口

沿用原 `lmstudio` 和模型 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`，上游 `http://192.168.5.20:6789/v1`，输出仍为 `native_schema / manual`，没有改变采样、思考、超时或限额。唯一业务配置变化为 `arena_live_research` 合同 `arena-live-research-v5` → `arena-live-research-v6`。

执行前再次通过正式只读入口核对提供方版本及验证计划：候选、配置版本和完整预算均与用户审阅结果一致。计划指纹为 `70bd503f69e47ed7aeb5d4305581742a4d34e827406150dc0d734d369275c04c`；原配置版本为 `2026-11-15T13:45:30.719Z`。

唯一写请求为 `POST http://127.0.0.1:3000/api/v1/ai/providers/test-and-save`，请求体沿用准备阶段的原候选，并附：

```json
{
  "operationId": "d8e1d8e0-20dc-4cd9-bb73-86b34bf86ce7",
  "authorized": true,
  "allowTextFallback": false,
  "planFingerprint": "70bd503f69e47ed7aeb5d4305581742a4d34e827406150dc0d734d369275c04c",
  "maxCalls": 1,
  "stopOnFirstFailure": true
}
```

执行目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`，宿主使用 Node.js `24.22.2`。执行脚本在发出请求前以独占写入创建调用标记，整段没有重试循环；正式 SDK 的 `maxRetries=0`，手动模式没有格式回退。私有回执保存在 `.recovery-artifacts/arena-v6-admission-execution-20261123/`，包含 `execute-once.mjs`、请求标记、最新计划、原始响应、前后只读快照和 `verify-result.mjs`／`verification.json`。这些脚本未写入容器或绕过正式保存入口。

## 真实结果

| 项目 | 结果 |
| --- | --- |
| 发起／结束时间（北京时间） | 23:20:51.946／23:21:23.133 |
| HTTP／宿主退出 | 201／0 |
| 真实模型调用 | 1 次；自动重试 0 次 |
| 模型请求标识 | `967e7e02-439e-4d01-bf0b-cfff6539efe5` |
| 实际验证耗时 | 31,141 毫秒 |
| 模型报告用量 | 输入 5,575 tokens；输出 1,261 tokens |
| 本次上限 | 1 次，输出 8,192 tokens，任务总预算 600 秒 |
| 费用事实 | 配置估算 `0 USD`，来源 `configured_model_pricing`；不冒充提供方账单 |
| 精确路由指纹 | `76e5055c8f0ff91ba9c812b453452db0a170a66c79a15a4ee7131fc59996c6c3` |
| 保存后配置版本 | `2026-11-23T15:21:23.124Z` |

正式验证记录为 `status=passed`、`errorCode=null`，与目标合同及请求标识匹配。只有这一条请求标识产生 `pending`／`passed` 两条状态观察；另有一条操作授权意图记录，不将日志行数当作模型调用次数。

## 保存、准入及保护读回

保存后再通过 `GET /api/v1/ai/providers` 独立读回：Arena 路由为 v6，`readiness.state=ready`、`reasons=[]`、`liveValidation.status=passed`，验证请求标识与本次实际调用一致。当前消费配置指纹为 `3f3ab07495dc884f33a35753a81a7b4208ef93be64d27190d753c12aa9d8f96b`；它与上表验证指纹各有用途，不互相替代。

将相同 v6 候选的预期版本更新为保存后版本，仅调用正式只读 `validation-plan`：返回 201，`pending=[]`、`maxCalls=0`。此步骤没有再次调用模型或保存配置，证明当前精确配置已具备可复用的通过记录。

强制只读 SQL 与原保护快照逐项对账通过：

- 原提供方行仅 `settings`、`updatedAt` 变化；设置内仅 Arena 合同和该用途的正式验证凭据变化。其他用途路由及通过凭据、模型、采样／思考、地址、定价、鉴权、凭据密文、开关等保持原值。
- 全部其他提供方记录摘要保持原值。
- 11 张受保护业务表的行数及内容摘要保持原值，没有创建或推进比赛，没有写入账户、委托、成交或研究周期。
- 模型资格状态记录由 113 增至 115，对应同一次调用的 pending／passed 两行；新增操作授权意图单独记录。
- 原维护队列 `paused=true`、持有者相同、`active=0`、`waiting=1`，其他作业计数保持。没有释放暂停或领取原待办。

所有读回及保护断言由 `verify-result.mjs` 验证，退出 0。仅执行本次必要的真实准入和定向读回；源码、部署产物与本地业务检查未变，不重复构建或全套回归。没有部署／重启，没有新建 worktree 或使用子代理，没有提交／推送。

## 一致性结论与剩余范围

R4D3 的单次真实验证、v6 保存、正式准入及独立读回通过，可以勾选完成。原 v5／旧比赛的失败原文及历史证据保持，不以本次通过改写历史结果。

本次证明当前模型与 v6 合同的精确结构化生成准入，不证明多轮业务决策、真实买卖、完整历史追平或实时衔接。一次调用授权已经使用完毕，不延伸为新比赛或后续模型调用预算。R4 完整追平／实时衔接、G03 美股盘中验证和远端 CI 继续按各自任务保持未完成；没有恢复美股开市等待。
