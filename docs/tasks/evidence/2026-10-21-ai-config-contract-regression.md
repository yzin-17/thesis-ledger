# AI 配置已移除能力的回归验收

接续[原配置任务](../2026-09-21-ai-provider-model-usage-configuration.md) AC-29，沿用[现行 Spec](../../specs/2026-09-21-ai-provider-model-usage-configuration.md)中能力声明、免费依据和上游限制已移除的合同。本次是原合同审计，不新增配置或模型调用。

## 源码与依赖

在 AI Server、提供方前端及共享 Schema 中，`capabilityDeclaration`、`freeEvidence`、`allowedUpstreams` 总共只有三处生产源码引用，均为 `ai-provider.contracts.ts:115～117` 的兼容输入字段删除，没有回到新输入/输出或界面字段。

九份工作区 package manifest 的摘要及依赖已记录。AI 运行时直接依赖仍为既定的 `ai@7.0.107`、`@ai-sdk/anthropic@4.0.58`、`@ai-sdk/openai@4.0.71`、`@ai-sdk/openai-compatible@3.0.53`；没有新增专用直连 SDK 或 CLI。扫描的 `openai`、`@anthropic-ai/sdk`、`@google/generative-ai`、`@google/genai`、`@lmstudio/sdk`、`ollama` 直接依赖均不存在，不把既定 AI SDK 适配包和其传递依赖混为已恢复能力。

`ai-provider-upstream.test.ts` 与 `ai-provider-readiness.test.ts` 两文件 24 项通过；包含旧配置读取、保存投影、扩展 profile、模型价格与路由合同。工程边界复用本次价格迁移已通过的检查，相关生产模块在此后未修改。

## 实际目标模块

在目标 Server、Worker 的独立只读 Node 进程中，分别加载实际安装的输入、配置读取、保存投影和上游映射模块。每个进程在内存中拦截全部 `fetch`，对旧读取、新输入和保存投影逐项检查三个字段均已剥离；各九项，共十八项通过，`fetchCalls=0`。原兼容扩展 profile 保留，四份模块摘要与宿主构建完全一致。

没有写配置、历史或部署文件，也未再同步或构建镜像。整个目标保护状态仍为默认设置并发后的 `f572f9214cad03ba756c032a206931be67c43fb894b170f48082d1e6fef2b325`，模型计数保持零。

私有证据位于 `.recovery-artifacts/remaining-p1-2026-10-20/`：

- `ai-config-contract-regression-unit.log`：24 项通过。
- `ai-config-contract-regression-source.json`：九 manifest 摘要、实际 AI 依赖和三处删除引用，SHA-256 `1d4178a740eee0e141f80e2cfd7aaaa5cd3203a475c10df7b01b27dae04798d1`。
- `ai-config-contract-regression-runtime.json`：两容器实际模块及保护回执，SHA-256 `9663e4567bca39817d9bd1a9e57d946a73c191b995074ff72d660aa2453d0038`。

AC-29 通过；不替代真实认证、生成、费用或跨业务结果。随后继续原 AC-12/27 的历史价格与部署保留验收。
