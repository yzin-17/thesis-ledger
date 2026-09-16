# DSA Fork 与上游边界

`daily-stock-analysis` 是与 `thesis-ledger`、`thesis-ledger-infra` 并列的独立 Git 仓库，不再位于主仓 `third_party/` 下，也不通过主仓 `.gitignore` 形成隐式依赖。

```text
thesis-ledger-workspace/
├── thesis-ledger/
├── daily-stock-analysis/
└── thesis-ledger-infra/
```

## 稳定仓库边界

- 上游：`ZhuLinsen/daily_stock_analysis`
- ThesisLedger Fork：`yzin-17/daily_stock_analysis`
- 主仓只保留 DSA client、共享 Schema、消费侧 Contract Test 和跨仓兼容说明；
- Provider Adapter、Provider 原始配置/凭证、Effective Policy runtime、DSA 专属 API 实现与上游同步冲突处理都在 DSA Fork 内完成；
- Compose、镜像 digest、Secret 注入和运行时部署清单由 `thesis-ledger-infra` 维护。

## 版本与兼容

不要在本文维护“当前共同 commit”或固定上游版本。发布级版本、Contract major、Fork release convention 与镜像兼容条件统一以 [`version-matrix.md`](version-matrix.md) 为 SSOT。

Data/Control Contract 的当前能力与验证规则见 [`2026-08-18-thesis-ledger-dsa-compatibility.md`](2026-08-18-thesis-ledger-dsa-compatibility.md)。市场数据当前产品侧架构见 [`2026-09-16-market-data-v2.md`](2026-09-16-market-data-v2.md)。

## 上游同步

具体 fetch/merge、临时分支、测试和冲突审计流程属于工程操作，不在 Architecture 文档复制维护；统一见 [`../engineering/2026-09-16-dsa-upstream-sync.md`](../engineering/2026-09-16-dsa-upstream-sync.md)。

架构层只保留一个不变量：任何上游同步只有在共享 Contract、主仓消费边界和必要跨仓回归继续通过时才允许进入可发布基线，不能为了追上 upstream 静默覆盖 ThesisLedger 依赖的行为差异。
