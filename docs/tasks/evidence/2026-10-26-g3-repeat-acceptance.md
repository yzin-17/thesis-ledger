# G3 再次单次验收记录

关联：[研究演进 Task](../2026-10-18-research-evidence-evolution.md)（G3-D36）、[自适应执行 Task](../2026-10-25-ai-adaptive-execution.md)（T5）。

## 授权与身份核对

用户因 OpenRouter 控制台未看到请求，明确要求“再试一次”。本次仅预留 1 次正式零费用请求，默认 `openrouter/free`、原 reasoning 与严格 V2 合同保持，`maxAiCalls=1 / maxCost=0`，失败或未知立即停止，不补发；实际派发后余 2 次冻结。D35 的 HTTP 404、generation ID 与私有原始响应保持，不因控制台未显示而改写其派发事实。

当前目标凭据在内存中计算的 SHA-256 与用户提供的控制台 hash 完全一致，标签首尾也相同。比对没有发起外部请求，也未输出或另存 API Key。

## 部署前状态

53 项执行输入与 D35 验收指纹一致；Server／Worker 为同一已验镜像 `sha256:df411ebf2eb06f93d083886c9d74633a9685bf02fb2849f80c39b1ab684d60a4`。V2=false、无临时策略、`pending=0`，默认修订 5、`openrouter/free` 就绪。

新提交身份为 `8d2a2c1a-aebe-4233-bc32-7ccd91ecbf95`，原 22 表、11 条旧 `AiRun`、121 条旧 `AiToolCall`、配置与挂载基线已保存。临时开关仍经 infra 正式 `update.sh thesis-ledger` 入口，指定复用同一镜像，不构建应用镜像，`DEV_DATABASE_MODE=check`；结束后关闭 V2。保留原数据、配置、验收包和 WIP，不 stage／commit。

## 当前验收状态

- [x] 凭据身份与冻结输入核对；模型 0。
- [ ] 正式开启、双角色／实际 Schema／自适应模块及 capabilities 核对。
- [ ] 唯一正式请求、上游原始响应与 SDK／业务结果分层核对。
- [ ] 同镜像关闭、trace 重建持久化、原数据／配置／WIP 保全。
- [ ] 报告消费、用量／实际费用与剩余额度核对。

私有原始记录保存于 `.recovery-artifacts/g3-d36-20261026/`；上次证据见 [D35 回执](2026-10-25-g3-adaptive-runtime-acceptance.md)。
