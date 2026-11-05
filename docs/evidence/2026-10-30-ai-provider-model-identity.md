# AI Provider 连接实际模型身份验收

日期：2026-10-30。所属任务：[AI 配置与用途](../archive/tasks/2026-09-21-ai-provider-model-usage-configuration.md#auth-connection-acceptance)。本证据关闭 `T5.2.MODEL-IDENTITY` 与当前 `T5.2.AUTH-CONNECTION`，完整 T5.2、T6 继续按剩余条件验收。

## 范围与授权

用户授权完成前四项，新增调用次数不限，并说明当前 Provider 免费。本轮只使用现有免费 Provider，实际费用上限为 0；旧冻结账本保持。本样本固定最多派发一次，使用已保存的 OpenRouter 凭据与 `openrouter/free`，只做非流式连接，不保存配置、不生成业务报告、不重试。

## 实现与本地证据

SDK 原有 `actualModel` 被 Provider 测试服务遗漏。新增 AI 模块内的测试事实 helper，复用原用量和费用计算，并将 SDK 成功结果或错误诊断中实际观测到的模型传到响应与新审计。没有观测时为 null；请求 `model` 与实际 `actualModel` 分开，历史审计不补写。Server 与 Desktop 响应类型同步。

九个文件共 77 项定向测试通过，其中包含本机 HTTP、真实 SDK、请求别名与实际模型不同的回归；均没有真实模型调用。Server/Desktop 类型检查、写集 ESLint、格式检查及修正源码清单后的完整边界门禁通过。边界清单独立证据见[记录](2026-10-30-boundary-source-inventory.md)。

## 目标同步与反读

2026-10-30 22:32:28～22:32:52（北京时间）执行 infra `./scripts/sync-code.sh thesis-ledger`，退出 0；Server 和 Backtest Worker 就绪。两角色的新 helper、审计和服务模块与宿主构建 SHA-256 一致。五容器 ID、镜像与挂载保留；这是容器可写层更新，不作为镜像或发布证据。

同步前后五份 Provider 普通配置、密文与验证记录一致，两个空对象仍在。620 条旧健康记录保留；新增一条 `dsa / scheduled / healthy`，属于服务自然健康检查，没有模型请求。

## 单次真实连接结果

入口：`POST /api/v1/ai/providers/openrouter/test`。请求在派发前以独占文件登记，`testKind=connection`、`model=openrouter/free`，没有业务用途或合同。

| 事实 | 结果 |
| --- | --- |
| 请求 ID | `5a912abe-bcf9-4cf5-9fdd-b964243023a8` |
| 返回及健康态 | HTTP 201，healthy |
| 目标耗时 | 18,512ms；外层 HTTP 18,548ms |
| 实际模型 | `dots-studio/dots-3-note-preview:free` |
| 模式 | json_validated，非流式连接 |
| 用量 | 上游报告，输入 24 / 输出 30 Token |
| 实际费用 | known / provider_reported / 0 USD |
| 定价版本 | `pricing-bd1326cf8cba0366` |
| 新审计 ID | `eff63a3f-1915-451e-bb66-d6099a759dc9` |
| 完成时间 | 2026-10-30 22:42:26.644（北京时间） |

独立数据库读回唯一对应健康记录，时间、模型、实际模型、耗时、模式和费用与响应一致；连接审计不含 purpose/contract。请求 ID 与审计 ID 在本次执行包中成对保存，不假称原数据库详情已经记录请求 ID。

本批次至此真实模型调用 1 次；无重试、回退、用途生成或配置保存。连接测试正常推进 Provider 健康与 updatedAt；五份普通设置、密文、用途验证记录、默认和两个空对象保持，全部旧审计保留。与同步后快照相比，仅 ProviderConfig 健康/修订、ProviderHealth、ProviderHealthCheck 发生相应变化，其余原表摘要一致。

## 证据位置与边界

执行包：`.recovery-artifacts/first-four-acceptance-20261030T134208Z/`。关键文件为 `model-identity-sync-result.json`、`post-sync-verification.json`、`real-connection-dispatch.json`、`real-connection-response.json`、`real-connection-audit.json`、`real-connection-verification.json`、`real-model-journal.jsonl`。测试、类型和写集日志与源码摘要保存在同一包中。

此前请求 `00764775-2bdd-4334-8246-b923465d16ca` 的实际上游模型仍未知，旧错误审计保持原样。本次新样本提供当前认证连接与身份事实，不补造历史事实，也不代表其他业务、协议、输出模式或完整生命周期均已通过。
