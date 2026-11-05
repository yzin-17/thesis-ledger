# M31 510300.SH 独立身份与分红币种候选原文

## 一手资料核对

上海证券交易所披露的[2025 年 6 月 11 日基金分红公告](https://www.sse.com.cn/disclosure/fund/announcement/c/new/2025-06-11/510300_20250611_ZAU4.pdf)标明基金为“华泰柏瑞沪深300ETF”、主代码 `510300`，权益登记日为 6 月 17 日、除息日为 6 月 18 日、现金红利发放日为 6 月 27 日，分红为每 10 份 0.880 元；公告还标明基准日份额净值单位为“人民币元”，分红采用现金方式。公告位于上交所披露目录，支持把完整查询代码识别为 `510300.SH`，并把该次分红货币记为 `CNY`。一次无凭据 HTTPS 读取取得 PDF 139491 字节，原文件 SHA-256 为 `9a2f554b8ba5e340c79905171388f65225e9239027a36794522aa6bb4a82be67`。

上交所披露的[2025 年 11 月 24 日基金产品资料概要](https://www.sse.com.cn/disclosure/fund/announcement/c/new/2025-11-24/510300_20251124_9WR7.pdf)交叉确认基金代码 `510300`、上市交易所为上海证券交易所、交易币种为人民币。一次无凭据 HTTPS 读取取得 PDF 261145 字节，原文件 SHA-256 为 `c00ceaf200a405a0e15459deff9d2ef5e1f12e8e0c88ba492169ca5f08f7b676`。该资料发布日期晚于 2025 年 6 月目标事件，不能用作当时策略可见性证据。

基于 6 月公告生成[内容寻址候选原文](2026-09-29-m31-510300-identity-candidate.json)，只覆盖 `510300.SH` 的 `2025-06-01..2025-06-30`，实际观察时刻为 `2026-09-28T18:26:32Z`。JSON 原字节 708 字节，SHA-256 为 `8f6eaec2a6e8c0459ced8528804a2bc0b95b40c75eaeecdc61c00d68aa927498`。用 DSA `resolve_hithink_fund_identity` 和合成准入验证完整代码、ETF、`exchange`、`CNY`、范围与原字节摘要均通过。没有将候选写入目标 Control 或签发真实准入。

## 仍需独立完成

[HiThink 基金分红官方接口页](https://github.com/HiThink-Tech/Financial-API/blob/main/docs/api/fund/corporate-actions-dividends.md)只给 `progress` 字符串及 `"实施"` 示例，未定义真实响应中的字符串 `"2"`；[ETF 历史行情官方页](https://github.com/HiThink-Tech/Financial-API/blob/main/docs/api/endpoints-fund.md)列出 `volume`、`turnover` 字段但不写单位。股票行情页给股票单位，不能外推到 ETF。此轮未再次请求 HiThink，既有实际 14 条记录的数字码仍未知。独立身份/货币候选不能替代进度码字典、事件历史覆盖、真实事件正路径、Server/Worker 冻结、历史 PIT 或 ETF 量额单位准入；M31-a、M31-b2-target 和 G-M2-Events 保持开放。
