# 浏览器请求标识兼容

风险规则页在浏览器未提供 `crypto.randomUUID` 时初始化崩溃。Desktop 使用同一浏览器 UUID 原语，保持 UUID v4 和原有幂等请求生命周期；原生实现可用时优先使用，否则使用 `getRandomValues`。不使用时间戳、计数器或 Math.random 降低标识质量；无安全随机能力时明确失败。

职责归 Desktop lib；业务模块只消费标识，不改变请求、重试、取消或服务端契约。审计 Desktop 同类调用，Mobile 的 expo-crypto 保持不变。门禁阻止业务层重新直调浏览器 randomUUID。

验收：安全与非安全上下文能力路径、缺少安全随机能力、风险页面预览和失败重试的幂等键稳定、实际浏览器受控交互；不写真实账户数据。
