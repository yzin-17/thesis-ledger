# 当前准备请求的 RunConfig 校验

## 变更

`backtest-run-preparation-v3.ts` 的当前准备入口使用 V3 字段 Schema 解析请求后，直接调用共享 RunConfig 业务校验，不再把输入投影为旧 RunConfig 并交给 V2 Schema 解析。日期顺序、初始现金及执行模型校验保持；旧解析器尚由测试引用，导出清理另按 C03 执行。

## 验证

- 准备、RunConfig 与执行模型定向 43 项通过。
- Schemas `pnpm test` 563 项、`pnpm run build` 通过；Server、API Client、Desktop `pnpm run typecheck` 通过。
- 受影响文件 Prettier 与 `node scripts/check-boundaries.mjs` 通过。

## 边界

当前未提交源码的本地合同验证；未执行隔离 PostgreSQL、目标 Worker、真实 Provider 或客户端验收。此叶移除了生产准备入口对旧解析器的依赖，但公开旧 Schema 与仅测试使用的旧输入仍待清理，C03/C04/E01/D02 保持未勾选。
