# ADR-013：账户模型在 API v1 中原子升级

## 背景

账户模型移除 `source`、新增自由文本 `institution`、把 `shadow` 拆为账户模式，并为组合查询加入真实与影子范围。这些变化无法无损映射回旧的 v1 请求和响应；新增 API v2 可以保持版本语义，但会要求长期维护兼容层。

## 决策

直接修改主系统 `/api/v1` 的账户、组合及相关查询 Contract，不新增 v2 兼容层。该决策以当前没有受支持的外部客户端为前提；Desktop、Mobile、Server 和数据库迁移必须作为同一版本原子升级。依赖的新 Fund NAV 能力通过同级 `daily-stock-analysis` 的 DSA Contract V1 向后兼容扩展交付，不因此升级主系统 API 版本或 DSA Contract 版本。

## 后果

旧 Desktop、Mobile 或自动化客户端不能连接升级后的 Server。共享 Schema、API client、fixture、E2E 脚本和用户文档必须同步更新。

`thesis-ledger-infra` 必须锁定主系统镜像、DSA 镜像和数据库迁移的兼容版本。发布门禁需要同时检查主系统版本握手、数据库 Schema 版本以及 DSA `contractVersion` 和所需 capability；任一组件不兼容时快速失败，禁止新旧组件混跑。三仓物理边界和镜像策略遵循 ADR-014。

## 替代方案

新增 v2 可以保持兼容但增加双版本维护成本；永久兼容需要把新机构和账户模式有损映射成旧 `source/type`，会重新引入本次要消除的领域混淆，因此不采用。
