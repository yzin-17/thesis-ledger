# ADR-017：收益分析配置边界

## 背景

收益分析需要把证券市值、现金余额和目标配置放在同一张比较表中。若直接复用持仓 `AssetType`，现金会被误建模为 Position；若在没有 FX 契约时合并不同币种，金额和权重会失去明确含义。指数目标也需要先支持配置规划，但当前系统尚未具备指数 Instrument 的录入、校验和行情链路。FX 合并还必须有来源、时点、陈旧阈值和估算口径，不能由页面隐式猜测。

## 决策

1. 引入独立的 `AllocationCategory` 配置类别，支持 `stock`、`etf`、`fund`、`index`、`cash`。配置类别只服务于收益分析的配置视图，不替代 `AssetType`、Asset 或 Position。
2. `cash` 只读投影同一 `accountId + mode` 范围内由 Ledger 计算的 Cash Balance。现金参与配置金额和权重分母，但不创建现金 Position 或 Asset。
3. 混合币种默认按原币种分组，允许“全部账户”读取但不直接相加；跨币种合并只能通过用户显式开启的 FX 开关，并选择基准币种。`currency` 是估值维度，不加入 `AllocationCategory`。
4. FX 由 DSA Contract V1 提供批量汇率，ThesisLedger 不直接调用外部 Provider。汇率在 `valuedAt` 获取；最近 7 个自然日内的陈旧汇率可以使用但必须标记，超过 7 天或缺失时阻断合并且保留分币种结果。
5. 历史 Snapshot 在 FX 合并模式下按当前汇率回算，响应标记 `estimated: true`、`conversionMode: "current-rate"`、`fxAsOf` 和 `fxStale`；该口径不是可审计收益。
6. `index` 先作为目标配置类别。没有指数持仓时当前权重可以为 0；本次不扩展 Instrument catalog、账户校验、行情能力、导入或迁移链路。
7. 配置目标按 account/portfolio scope 版本管理，实际和影子模式共享目标版本。界面展示当前 `version` 和 `createdAt`，本次不提供历史回滚。
8. 收益区沿用 Snapshot 的截止时间；配置区使用 layers 的估值时间和行情质量。行情 partial 与 FX stale/blocked 分开表达；行情 partial 时保留可用金额，隐藏权重并暂停再平衡建议。

## 后果

- 配置金额可以同时解释证券和现金，但任何现金变化仍由 Ledger 驱动。
- 前端必须在模式切换和账户选择时检查币种，并为 partial、FX stale/blocked、缺失标的和不可计算收益保留明确状态。
- 目标配置需要独立的分类规范化和版本响应；旧分类不能静默丢弃。
- 指数只能出现在目标配置中，真正可持有的指数类型需要另建领域设计。

## 替代方案

- 将现金建模为特殊 Position：会破坏 Cash Balance 的既有边界，并可能重复计入现金。
- 在页面内直接调用 Provider 或使用 1:1 兜底：会绕过 DSA 的缓存与来源边界，制造不可审计的组合金额。
- 立即把指数扩展为完整 Instrument 类型：范围会扩大到目录、导入、行情和迁移，超出本次收益分析交互的正确性目标。
