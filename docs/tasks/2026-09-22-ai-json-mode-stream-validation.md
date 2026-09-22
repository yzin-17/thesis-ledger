# AI 输出模式与完整流验收实施任务

> 任务标识：`2026-09-22-ai-json-mode-stream-validation`
> 对应 Spec：[AI 输出模式与完整流验收](../specs/2026-09-22-ai-json-mode-stream-validation.md)
> 状态：代码与回归用例已提交；尚未通过依赖完整的测试、构建和运行态验收，PR 保持 Draft。

## 实施清单

下面的勾选只代表实现或测试代码已经编写，不代表运行验证通过。

- [x] T0：读取当前完整适配器、共享契约、Provider 编辑和 SDK 锁定版本输出实现，先建立增量 Spec/Task。
- [x] T1：共享契约新增明确的 `json_mode`，保留 `json_validated` 的旧语义和现有默认值。
- [x] T2：统一 SDK 输出策略与完整输出解析；JSON Mode 本地验收；不支持组合在发送前拒绝；原生模式不重复执行 Zod transform。
- [x] T3：流式用量在最终输出校验前捕获；提前处理输出 Promise 的拒绝；保留 unknown 与零重试边界。
- [x] T4：新增 `ai-generation-output.test.ts` 与 `ai-json-mode.integration.test.ts`。包含模式配置、出站 HTTP/SSE、分段 JSON、usage 尾帧、非法 JSON、Schema 失败、截断、无需追加提示 Token 和不支持组合等回归用例。
- [x] T5：输出方式使用单一中文标签映射；Anthropic 下禁选无 Schema JSON Mode，但不静默改写现有选择；新增兼容、发布和回滚说明。

## 验证记录

| 检查 | 结果 | 证据边界 |
| --- | --- | --- |
| TypeScript 单文件语法转译 | 通过：10 个 TS/TSX 文件，0 个语法错误 | 本地 TypeScript 5.8.3 的 `transpileModule`；未解析项目依赖，不是 typecheck |
| 变更文件空白检查 | 通过 | 本地改动文件集合执行 `git diff --cached --check`，不是完整仓库 checkout |
| 定向 Vitest | 未执行 | 当前环境无法克隆或安装锁定依赖 |
| 相关包 typecheck/build | 未执行 | 不能以语法转译代替 |
| 仓库边界、复杂度、尺寸门禁 | 未执行 | helper 保留在 AI 接入模块，仍需完整仓库门禁验证 |
| PR CI | 待 GitHub Actions 结果 | CI 状态以对应提交的 GitHub checks 为准 |
| 浏览器/目标运行态 | 未执行 | 选项交互仍需实际 UI 验收 |
| 真实 Provider | 未执行 | 不使用本地 HTTP fixture 冒充真实上游验收 |

执行环境能通过授权 GitHub 连接读取和提交文件，但容器网络无法解析 GitHub，未成功克隆仓库，也没有项目的 pnpm/Zod/AI SDK/Vitest 依赖。没有调用真实模型、没有产生模型测试费用，没有修改数据库、依赖、锁文件或 CI 工作流。

## 尚需执行的门禁

- [ ] 安装项目锁定依赖并构建共享 Schema，执行下面的定向测试。
- [ ] 相关包 typecheck/build、原有 AI 适配器/Provider/研究/策略回归与仓库门禁。
- [ ] 核对新模式是否还有旧客户端或枚举穷尽映射消费者需要同步，不能仅依据本地文件集合宣称全仓兼容。
- [ ] PR CI 通过。
- [ ] 浏览器中验证两级输出选项、禁用状态、原值回显及用途测试。
- [ ] 目标运行态/真实 Provider：Chat、Responses 的 JSON Mode 及流式用途生成；失败时检查 Token、费用和任务终态。

建议先运行：

```sh
pnpm install --frozen-lockfile
pnpm --filter @thesis-ledger/schemas build
pnpm --filter @thesis-ledger/server exec vitest run \
  test/ai/ai-generation-output.test.ts \
  test/ai/ai-json-mode.integration.test.ts \
  test/ai/ai-sdk-generation-adapter.integration.test.ts \
  test/ai/ai-provider-readiness.test.ts
```

本阶段没有自动能力选择、用途探针/生产配置统一或前端流式预览实现，不得标记为已交付。真实运行门禁仍属于当前未完成事项，不能移入 TODO 或用代码提交代替。
