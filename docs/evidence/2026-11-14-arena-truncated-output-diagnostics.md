# 截断诊断离线实施与验证

## 实施结果

用户已确认 LM Studio 配置，本轮不再重复核对或发送真实模型请求。实现承接[排查记录](2026-11-14-arena-output-truncation-investigation.md)，只补全完整单次响应被拒绝时的诊断。

- 单次非正常结束先读取安全的正文与思考文本属性，不访问结构化 `output` getter；随后保持既有错误码、失败确定性与实际总用量。`length` 继续拒绝，不能将有效 JSON 或推理中的草稿当作成功结果。
- 复用现有正文诊断，保留字符数、SHA-256、JSON 状态和脱敏结构预览。空正文现在明确为 `empty`，不再一律误记为 `missing`。
- 新增可选 `reasoningOutput` 与 `outputTokenDetails`。思考只保留总字符数、摘要和前 65536 字符的重复统计；不新增原始思考文本存储。重复指标分别为至少 8 字符的相同行、至少 32 字符的相同段落在窗口内的最大次数，不推算全文次数。
- 分项 token 仅使用 SDK 提供的值，未知保持 `null`，明确的零保持零，不用总输出减思考量猜算正文量。费用和总额度仍走原有计算路径。
- 新字段可选，既有无新字段的错误记录继续通过 Schema。Arena 沿用 `error.fact` 审计消费；原独立 `diagnostics.outputText` 仍走旧文本提取路径，本次不声称保存完整失败正文或补回历史丢失文本。

`ai-generation-failure-diagnostics.ts` 本轮开始前已有他方重构；本次只增加可选已完成响应文本入口，保留原改动。新职责放在 AI 领域 helper 与独立 Schemas 文件，没有模块依赖反向变化，不需要新增边界例外。

## 统计实现核对

已按项目规则检查本地 `es-toolkit@1.51.0` 的依赖、`countBy` 声明、实现和[官方文档](https://es-toolkit.dev/reference/array/countBy.html)。该版本数组 `countBy` 使用普通对象并直接按键取值；任意模型文本可包含 `__proto__`、`constructor` 等属性名，不适合直接用于这一统计。保留仅供有界诊断使用的原生 `Map` 计数，没有新增通用工具模块、依赖或全局例外；补测确认这些文本按普通行计数。

## 验证

全部测试仅使用合成响应。新用例在 `httpClient` 边界直接注入 `Response`，地址为 `unused.invalid`、没有实际网络请求；既有 SDK 集成回归使用进程内回环 HTTP 服务，不访问模型提供方。

| 检查 | 实际结果与输入范围 |
| --- | --- |
| `pnpm --filter @thesis-ledger/schemas build` | 通过；新增可选诊断类型 |
| `pnpm --filter @thesis-ledger/server exec vitest run test/ai/ai-generation-finished-output.test.ts test/ai/ai-generation-failure-diagnostics.test.ts test/ai/ai-sdk-generation-adapter.test.ts test/ai/ai-sdk-generation-adapter.integration.test.ts test/ai/ai-generation-failure-diagnostics.integration.test.ts` | 5 文件、45 项通过；当时新文件含 8 项 |
| 增加属性名边界后，单独执行 `test/ai/ai-generation-finished-output.test.ts` | 最终 9 项通过；其余 37 项输入未变，复用上一条证据，去重合计 46 项 |
| `pnpm --filter @thesis-ledger/server typecheck` | 通过 |
| `pnpm --filter @thesis-ledger/server build` | 通过 |
| 相关 AI 源码及新测试的 ESLint | 通过 |
| 新 helper、新测试及两份 Schemas 的 Prettier 检查 | 通过，最终新增边界测试后复核 |
| `node scripts/check-boundaries.mjs` | 通过，未新增模块边界豁免 |
| `node scripts/check-file-size-guardrails.mjs` | 无警告 |
| 本次文件 `git diff --check` | 通过 |

SDK 旧回归中 Anthropic 合成模型产生未知模型输出额度的提示，是原回归的受控输入提示，不是当前 LM Studio 请求，也没有将该额度应用到真实模型。

## 最终审查与交付边界

本叶 AC01–AC05 的离线实现与验证通过：覆盖空正文和循环推理、三种生成模式下有效 JSON 但被截断、明确零与未知分项、敏感内容不进入新诊断、正常成功保持原结果，以及任意文本计数边界。SDK 请求次数保持 1，不新增输出额度或思考设置。

离线实施阶段没有模型调用、研究重试、队列操作、真实业务写入、部署或提交。没有运行数据库或浏览器验收，因为本叶不改业务存储、UI 或运行环境。该阶段结束时新诊断尚未在目标容器生效；后续用户单独授权的正式同步由[回放主任务](../tasks/2026-11-12-arena-replay-live.md)承接，实际结果见[本地部署证据](2026-11-14-arena-diagnostics-local-deployment.md)。不能把本叶离线通过当作模型循环已修复或实时衔接通过。
