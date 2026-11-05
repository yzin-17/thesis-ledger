# S04 整窗口主备 Reader 父项对账

## 当前条件

S04 依赖的 C04 wire/handshake 已完成；S03 版本隔离缓存的原 I01 完整响应数据库失配经修复与隔离复验后，[父项现已收口](2026-09-28-cont-s03-parent-reconciliation.md)。S04 自身的验证口径是 Server Reader/selector 的整窗口主备选择，真实 DSA 账号联通属于 I01/G0-H，不由 fixture 冒充。

## 定向验证

当前源码执行 `pnpm --filter @thesis-ledger/server exec vitest run test/market/market-window-selector-v3.test.ts test/market/market-bar-reader-v3.test.ts test/market/market-bar-reader-v3-delegation.test.ts test/market/market-reader-review-regressions.test.ts`，**4 文件 28 passed**。包括完整主源、主源缺页后仅在有效同口径证明下整窗备用、未知金额语义/过期证明拒绝、上市前/缺窗/预热不足、响应窗口/实际目标及 Effective revision 不匹配、partial 目录、分钟线未能证明完整性时失败关闭；备用读取始终使用同一请求窗口，且没有第三源请求。实际 V3 Reader 委派给整窗 Reader，完整响应在成功选择后由证据仓库记录。

另有 [I01 受控 Worker 组合](2026-09-28-cont-i01-jsonb-orm-fix.md)和 [D01 多窗口组合](2026-09-28-cont-d01-controlled-http-worker.md)使用实际 DSA 客户端、Reader、隔离数据库和普通 Run 创建，证明主源路径不止停留在选择器单测；备用只由受控定向测试证明，未声明真实备用来源准入。

## 状态边界

据此关闭 S04 的 Server 本地实现与验证父项。严格 PIT 的历史可见性仍属 S05；真实 HiThink 原标的、兼容备用的实际同源/独立性与 G0-H、目标最新应用源码和普通真实回测均未完成，完整 Spec AC01–AC20 不随 S04 勾选。
