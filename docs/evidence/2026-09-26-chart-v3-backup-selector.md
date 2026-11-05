# 图表 V3 备用整窗选择实施记录

日期：2026-09-26。所属叶：U04-backup-selector。工作区既有改动保留，未提交。

## 已实现

- 新增 `apps/server/src/market/market-chart-selector-v3.ts`，由图表 Reader 调用；主源成功直接返回，失败时最多尝试明确配置的一个备用目标。
- 内部可选参数沿用 S04 证明与观测契约。调用备用前验证目标准入、证明有效期、路由、标的、目标对、请求窗口与观测一致性。
- 备用返回后重新验证实际来源、策略修订、价格基准、序列指纹及证明有效期；返回完整备用窗口，由原 Reader 计算获取身份并切片，不拼接主备价格。
- 没有证明时保留主源失败；未接入转换执行器时拒绝转换证明。主源返回不同策略修订时立即终止。
- HTTP 端点没有新增证明输入；本地选择器不负责签发或认证外部证据。

## 验证

- `pnpm --filter @thesis-ledger/server test market-chart-selector-v3 market-chart-reader-v3 market-chart-detail-v3`：3 文件、28 项通过，其中选择器新增 14 项。
- 新增选择器及相关 Reader、测试 ESLint 通过。
- `node scripts/check-boundaries.mjs` 与 `git diff --check` 通过。
- `pnpm --filter @thesis-ledger/server test`：176 文件通过、15 文件跳过；1223 项通过、49 项跳过。跳过项不计为通过，也不替代真实数据库或运行态门禁。
- `pnpm --filter @thesis-ledger/server build`：通过。

## 后续接缝

U04-backup-evidence 尚未完成：现有 S04 提供内部证明输入契约，尚无实际图表可读取的可信证明供给。在线端点因此仍保持无证明不回退，不能把本轮合成证据测试标记为真实备用来源已准入。

下一步需要实现经审核证据的可信读取与失效机制，绑定精确来源、标的、窗口及观测版本，再接入实际图表请求。目录 ready、相同复权标签或 Provider 返回数据不能自行充当兼容证明。U04 父项、目标 Docker/Electron、真实来源验证及 M2/M3 仍开放。
