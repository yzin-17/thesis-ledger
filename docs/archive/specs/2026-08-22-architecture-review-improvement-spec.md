# ThesisLedger 架构改进规格

**状态：** 已完成，2026-08-22 归档。

## 背景

本规格用于审查 `thesis-ledger`、`thesis-ledger-infra` 和 `daily-stock-analysis` 三个仓库的架构边界，在尽量少改动 DSA 的前提下改善长期可维护性。

## 架构原则

ThesisLedger 仍然是产品和业务系统。

DSA 仍然是外部 Market Intelligence Provider，不将 DSA 重构为 ThesisLedger 的内部模块。

## 目标架构

```text
Desktop / Mobile
        |
ThesisLedger API
        |
Application Layer
        |
Domain Layer
        |
Provider Adapter
        |
DSA Contract API
```

## 范围

### ThesisLedger

- 加强 Provider 抽象；
- 通过 Adapter 隔离 DSA 集成；
- 增加结构化研究结果持久化模型；
- 准备异步任务执行能力；
- 改善 Contract 校验。

### DSA

不进行大规模重构，只维护：

- 现有 API Contract；
- 兼容层；
- Capability discovery；
- 集成稳定性。

### Infra

- 改善版本矩阵；
- 增加 Contract 测试；
- 增加 CI 校验。

## 非目标

- 重写 DSA 架构；
- 将 DSA 数据模型迁入 ThesisLedger；
- 将业务逻辑与 LLM 输出耦合。

## 后续方向

ThesisLedger 应消费结构化 intelligence results，而不是直接依赖 DSA 实现细节。
