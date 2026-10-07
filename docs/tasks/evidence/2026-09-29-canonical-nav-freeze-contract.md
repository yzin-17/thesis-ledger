# 场外 NAV 冻结输入合同前置

`E01-N1` 需要与场内 Bar 不同的 RunConfig 与 Snapshot 输入。新增 `backtestNavRunConfigV3Schema`，明确基金代码、CN/CNY 执行模型及其申赎费用，拒绝场内 `executionPriceProtocol`、Bar 绑定和模型标的不一致。新增 `backtestNavSnapshotManifestV3Schema`，只接受 `inputKind='nav'`、精确 `FUND_NAV_HISTORY` 路由、已选择目标及策略/适配/来源/凭据修订、估值日历证据、逐日同标的正净值、来源发布时间原始证据、完整覆盖、NAV Parquet 产物摘要和冻结内容摘要。路由目录的 `assetType='MUTUAL_FUND'` 与 DSA 实际接口一致；执行模型的 `instrumentType='NAV_FUND'` 保留经济分类，两者显式映射。`backtestNavFrozenInputV3Schema` 在一个读取入口核对配置与 Manifest 的标的、范围、冻结时点和执行模型版本。缺估值日、未来可见、日历晚于 `dataAsOf`、缺来源发布时间、非完整覆盖或 Bar 产物均拒绝。

合同保持当前场内 Snapshot 不变；新增 NAV Manifest 尚未由当前 Run 创建、Reader、Store 或 Runner 消费。`MarketService.getFundNavHistory()` 当前面向展示，返回的 `fundNavSchema` 只有 `navDate` 与日期级 `fetchedAt`，不包含可核验的逐事实历史发布时间或冻结原文。它不能作为本合同的正向输入，也不能将本地抓取日期当成历史可见时间。

公开候选复核：[Tushare `fund_nav` 官方字段表](https://tushare.pro/document/2?doc_id=119)提供 `ann_date`、`nav_date`、`unit_nav`，并写明至少 2000 积分权限；其示例为日期粒度，未给出逐行发布时间时刻、原始记录身份或历史修订流。`ann_date` 可作为公告日期候选证据，不能直接填成 `sourcePublishedAt` 时间戳，更不能证明当前账号的目标标的与窗口权限。因此真实来源与精确可见时间仍待独立核验。

本地验证：新增 4 项正负例、Schemas 全包 46 文件 550 项、Schemas build、目标文件 ESLint/Prettier 与模块边界检查通过。Domain 经济消费、独立 NAV Reader、冻结产物读写/摘要复核、隔离 PostgreSQL、目标 Worker/DSA 与真实来源尚未验收；`E01-N1` 至 `E01-N4`、`AC15` 保持未勾选。
