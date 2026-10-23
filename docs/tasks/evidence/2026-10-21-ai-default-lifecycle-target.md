# AI 默认引用的目标原子清除回执

接续[原配置 AC-21](../2026-09-21-ai-provider-model-usage-configuration.md)，按[精确预案](2026-10-21-ai-default-lifecycle-target-plan.md)执行。原 PostgreSQL 删除/停用/竞争和 E3 Web 确认/取消复用；这次只补实际目标原子清除与恢复。生产代码未变，无真实连接、模型或费用请求。

## 实际正常 API 结果

| 阶段                 | HTTP 与独立数据检查                                                            |
| -------------------- | ------------------------------------------------------------------------------ |
| 错误默认修订         | 409，提示 AI 默认模型设置已变化；配置、默认与完整保护逐字节不变                |
| 缺少清除标记         | 409，提示当前 Provider 是研究默认；完整状态不变                                |
| 当前双版本、明确清除 | 200，事务内 Provider 正常推进修订时间，默认两个引用字段均为 null，默认修订 2→3 |
| 恢复原默认           | 200，正常设置 API 恢复原 Provider/模型，修订 3→4；无额外恢复请求               |

所有生命周期请求的 `enabled=true` 与原值相同，`lmstudio` 全程保持启用；没有实际停用、删除或重新激活用户配置。现有保存服务复用已存用途证明，不运行模型测试。最终引用仍为 `lmstudio / qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`。

Provider 仅 `updatedAt` 从 `2026-10-07T13:34:28.596Z` 变为 `2026-10-20T22:46:13.767Z`；设置、密文摘要、启停、优先级、身份及其他字段精确相同。全局设置仅修订 2→4、时间从 `2026-10-20T21:07:02.778Z` 变为 `2026-10-20T22:46:14.985Z`，原引用和创建时间恢复/保留。

同一 SQL 语句绑定自有原行、其他配置摘要、总摘要和默认行。两张表的上述正常版本变化独立精确检查通过后，再对完整保护比较；十二账户、57 份成功回测、十六条策略路由、所有旧业务与全部模型计数不变。不声称本次全库字节不变。

## 验证与证据

`scripts/ai-default-lifecycle-target.mjs` 默认只读计划，`--apply` 绑定当前身份、既有已启用状态和完整计划；不允许把停用配置启用。PostgreSQL 无时区 timestamp 显式按 UTC 转为 Prisma ISO 修订，避免宿主机本地时区造成无效冲突。12 项保护测试通过；与前两组保护测试合计 40 项通过，均无跳过。

目标 Web 研究准备面板回显原默认，“保存默认模型”禁用；关闭并恢复原模拟账户成交页，没有创建研究。Web 后再独立读取与最终回执完全相同。最终完整保护 JSON SHA-256（含换行）`180a3cb12aea2b8e6f3f0b79cbd1959b74aa09be5f5f3932ccb8159f38ce88ff`。

原始证据位于 `.recovery-artifacts/remaining-p1-2026-10-20/`：

- `ai-default-lifecycle-plan-utc.json`：计划指纹 `bd6125b957b3308d7a8005c70a98f5b0e422e5b4cc996e92f257fc015c4cef14`。早先只读计划未执行并保留。
- `ai-default-lifecycle-result.json`：SHA-256 `4880041667724b153ed626c46d4f4f7c92fbf240e005043c2bca328e9aaf9549`。
- `ai-default-lifecycle-web.png`：SHA-256 `4f57cc6546f714ac8e2a113099d71dba6a69eff69fb8279ad128a82d2e8e1108`，与前次相同回显的截图一致。
- `ai-default-lifecycle-web-after.json`、`ai-default-lifecycle-guards.log` 保留最终状态与测试结果。

本叶补齐目标原子清除路径，并与原 PostgreSQL 全动作、E3 Web 确认/失败证据共同覆盖配置生命周期合同。AC-17～20 的真实研究/冻结消费仍单列暂停，不用配置清除代收。只验 Web，DG3 原 TODO 和真实模型暂停保持。
