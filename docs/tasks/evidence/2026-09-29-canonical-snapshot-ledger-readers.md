# Snapshot 与现金账本旧格式读取删除

## 变更

- `packages/schemas/src/backtest-data.ts` 删除无生产调用的 Snapshot V1/V2 解码器、旧价格语义推断及其导出；当前 Snapshot Schema 对旧 `manifestVersion` 显式拒绝。`snapshot-manifest-v3` 的格式标识继续用于完整性核验，不随代码命名清理。
- `packages/schemas/src/ledger-v2.ts` 删除只服务历史迁移划转的宽松载荷和事件 Schema。`apps/server/src/ledger/cash-projection.ts` 不再在当前事件解析失败后用旧迁移 actor 回退解析，缺少 `transfer` 元数据的历史划转使投影报错。当前账本事件版本与经济运算仍保留，后续 C03 要逐项确认其合同所有权。
- 现金投影不再过滤缺少 `factId` 的存量事件；此类事件在进入余额计算前明确报错，避免把旧格式记录静默忽略后生成不完整余额。

## 验证

- Snapshot 与 Ledger Schema 定向测试：`50 passed`；Server 现金投影定向测试：`16 passed`。Schemas、Server 类型检查通过。
- Schemas 包级 `564 passed`，Server 包级 `1685 passed, 81 skipped`；Schemas、Server 构建与 `scripts/check-boundaries.mjs` 通过。
- 缺失 `factId` 前置拒绝的 Server 现金投影定向 `16 passed`。随后 Server 全包出现 6 项测试失败，均为未更新的旧 Catalog `contractVersion: 1` 夹具和 V1 DSA URL 断言；修正测试为当前 V3 后，相关 3 个文件定向 `34 passed`，最终 Server 全包 `1685 passed, 81 skipped` 且类型检查通过。失败和修正不涉及现金投影生产逻辑。

## 边界

这只移除了两个旧格式读取分支，尚未证明整个账本和回测执行链只有单一格式。数据库旧事件、目标 Docker、真实 Worker 及正式保留数据升级均未验收；C03、C04、E01、U02、D01–D03 不勾选。
