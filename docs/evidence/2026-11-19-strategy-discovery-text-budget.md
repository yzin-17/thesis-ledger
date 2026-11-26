# 策略发现文本模式固定消息预算验收

2026-11-19，正式发现入口的固定消息从 29,680 降至 15,956 个 UTF-8 字节，低于 16,000，余量 44。v5 原生模式沿用原回执，本轮仅核对本地装配、内存 SDK 请求与结果校验。

## 同一输入的字节构成

使用正式 `strategyOptimizationPrompt` 和既有固定夹具。样本为 600519.SH、日线、balanced、至少一笔平仓、第 1 轮、无历史候选，使用冻结的归一化研究配置。预算计量为 `Buffer.byteLength(JSON.stringify(messages), 'utf8')`。表中各段按其在消息 JSON 中的转义后字节计数，Schema 标记、合同引用、JSON 输出要求及动态价格口径说明计入系统提示。消息外壳含角色、键名、引号和分隔符。

| 消息组成 | 修复前 | 修复后 | 减少 |
| --- | ---: | ---: | ---: |
| 系统消息内的完整 Schema | 20,935 | 13,948 | 6,987 |
| 其余系统提示 | 8,384 | 1,647 | 6,737 |
| 业务输入 | 300 | 300 | 0 |
| 消息外壳 | 61 | 61 | 0 |
| **合计** | **29,680** | **15,956** | **13,724** |

文本 Schema 取自相同的 Draft 2020-12 投影。标准 YAML 的 53 个锚点和 126 个别名复用相同的映射和数组，覆盖重复的字段约束、必填清单和引用。通过标准 YAML 解析器展开后，与改动前捕获的 Schema 深度相等，包括 28 个本地定义、递归引用、注解、委托顺序及数值约束。文本提示删去合同已描述的字段字典和重复的完整策略示例，保留买卖信号、触价与收盘保护、父子委托、会话、仓位与等待的执行语义。范围、冻结来源、目标、轮次、历史候选及价格口径继续由原装配路径写入。

## 入口及输出校验

- `prepareOptimizationGeneration` 的文本预留等于完整消息的 15,956 字节。真实的目标和历史反馈按各次输入计量。
- `validateGenerationRequest` 接受完整发现合同。缺少文本合同，或将合同内的 `additionalProperties: false` 改为 `true`，均被预检拒绝。原有完整 JSON 合同的预检仍适用。
- 内存 HTTP 客户端截获正式 SDK 请求。两种模式都保持原消息和 2,048 的测试输出额度。文本模式返回合法 JSON 时得到与原 Zod 校验一致的对象，注入非法行情字段时返回 `schema_invalid`。原生请求的 `response_format.json_schema.schema` 与正式输出格式相同。
- 原生消息 6,938 字节，完整原生输出格式 19,216 字节，预留合计 26,154。前后两份消息逐字节相同，两份输出格式亦逐字节相同。修复前的价格口径已明确“同坐标直接使用该价位”，将过时的“绝对价格”字面测试改为断言这条实际规则，并保留转换证据断言。
- 三个定向测试文件共 27 例通过。Server 类型检查与四个涉及文件的 ESLint 通过。真实模型调用为零，部署、提交、推送为零。正则穿透与 ATR 旧失败仍按原回执记录。

## 复核命令与原始捕获

在仓库根目录执行。离线安装将锁内已有的 YAML 2.9.0 声明为 Server 的直接依赖。前后捕获使用同一夹具，在代码修改前和修改后分别指定 `BUDGET_STAGE=before` 与 `BUDGET_STAGE=after`。

```sh
rtk proxy pnpm --filter @thesis-ledger/server install --offline --frozen-lockfile --ignore-scripts
rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/strategy-optimization/strategy-optimization-prompt-contract.test.ts test/strategy-optimization/strategy-optimization-discovery.test.ts test/ai/ai-generation-schema-prompt.test.ts
rtk proxy pnpm --filter @thesis-ledger/server typecheck
rtk proxy pnpm exec eslint apps/server/src/ai/ai-generation-schema-prompt.ts apps/server/src/strategy-optimization/{strategy-optimization-discovery,strategy-optimization-prompt}.ts apps/server/test/strategy-optimization/strategy-optimization-prompt-contract.test.ts
rtk proxy env BUDGET_STAGE=after pnpm exec vitest run --config var/acceptance/t04e-minute-600000-warmup-20261119-DxA0Af/vitest.config.mts var/acceptance/discovery-text-budget-20261119-3Bxckb/capture.test.ts
```

原始文件在 `var/acceptance/discovery-text-budget-20261119-3Bxckb/`。文本消息修复前后的 SHA-256 分别为 `e025d69fb2565f3a6946d2bf07530711df0d045eaf83882f47616bc4ebbc8f69`、`4113116f13f34586940333740c51c4d692429deac04b7cea7d5ba932dca7fb0d`。原生消息前后均为 `d81a53c02ab840487e1234cc178e2cadd02dadaf58b6f8d74009c46334a77af3`，原生输出格式前后均为 `6654ce125da2788904aed55baa63b7c592faf9f953503e6678d4e2ca8e0c0a8c`。早期样本沿用[原预算记录](2026-11-17-strategy-discovery-message-budget.md)。
