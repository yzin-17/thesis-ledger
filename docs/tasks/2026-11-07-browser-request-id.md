# 浏览器请求标识兼容任务

对应 [Spec](../specs/2026-11-07-browser-request-id.md)。保留共享工作区已有修改。

- [x] Desktop UUID 原语及全部直接消费者迁移，原生消费者保持不变
- [x] 目标测试：随机能力、风险预览、失败重试
- [x] Desktop 包测试、构建、针对性门禁（扩大 lint 的两处既有失败单独记录）
- [x] 实际浏览器缺少 randomUUID 的受控验收，真实数据只读

选型：已核对 es-toolkit 1.51.0 的 random 与 compat/uniqueId 实现。前者使用 Math.random，后者使用模块内计数器，均不适合请求 UUID；采用原生 WebCrypto，无依赖修改。

最新结果见 [验收记录](../evidence/2026-11-07-browser-request-id.md)。本轮缺陷及受控浏览器验收完成；不代表共享工作区全仓 lint 或真实风险规则写入已验收。
