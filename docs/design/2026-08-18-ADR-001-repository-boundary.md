# ADR-001：独立主仓与 DSA Fork

## 背景

用户资产事实与金融计算能力具有不同生命周期。

## 决策

Investment OS 使用独立主仓；DSA Fork 作为内部能力服务，通过稳定 Contract 接入。

## 后果

主仓拥有 Account、Ledger、Risk、Journal 和 Strategy；需要维护 Adapter 与上游同步流程。

## 替代方案

直接扩展 DSA 会让产品领域依赖 Python 项目结构；完全重写行情能力会延迟交付，均不采用。
