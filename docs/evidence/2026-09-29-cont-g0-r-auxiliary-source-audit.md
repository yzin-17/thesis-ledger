# G0-R 辅助来源固定版本审查（2026-09-29）

## 审查范围与方法

只读审查 `a-stock-data v3.10.0` 标签提交 `2e0ae6383c649b2bc5f68d3bc430d357f1c59ae7` 的 `SKILL.md` 与 `LICENSE`，对照当前 DSA Consumer；读取 `free-stockdb` 的镜像协议，并尝试访问问财 SkillHub 官方页面。未安装第三方 Skill、未下载数据集、未调用行情或检索接口，以下结论仅是代码与文档级来源选择，不代表上游准入或数据使用授权。

## 候选结论

| 候选 | 固定来源与实际远端 | 当前 Consumer 与结论 |
| --- | --- | --- |
| R07.14 腾讯报价 | [固定版 §1.1](https://github.com/simonlin1212/a-stock-data/blob/2e0ae6383c649b2bc5f68d3bc430d357f1c59ae7/SKILL.md) 的 `tencent_quote` 请求 `https://qt.gtimg.cn/q=`；代码许可证为 [Apache-2.0](https://github.com/simonlin1212/a-stock-data/blob/2e0ae6383c649b2bc5f68d3bc430d357f1c59ae7/LICENSE) | 选定 `CN STOCK × REALTIME_QUOTE`，对照既有 `data_provider/akshare_fetcher.py::_get_stock_realtime_quote_tencent`，实际同属腾讯 `qt.gtimg.cn/q=`。此候选**不采用为新增 Provider**；R07.15 无独立适配价值。代码许可证不等于腾讯行情数据的再分发授权。 |
| 腾讯日 K 备选 | [固定版 §1.2](https://github.com/simonlin1212/a-stock-data/blob/2e0ae6383c649b2bc5f68d3bc430d357f1c59ae7/SKILL.md) 请求腾讯 `/appstock/app/fqkline/get`，缺原生成交额 | 既有 `data_provider/tencent_fetcher.py::TencentFetcher` 已用相同主端点，覆盖日 K 的 `none/qfq`；不能作为独立来源计数，也不以 `close × volume` 估算额冒充原生成交额。此处未审真实量价单位、复权基准、历史覆盖和目标准入。 |
| R07.16 通达信盘后包 | [固定版 §1.3](https://github.com/simonlin1212/a-stock-data/blob/2e0ae6383c649b2bc5f68d3bc430d357f1c59ae7/SKILL.md) 的 `tdx_daily_package` 请求 `https://www.tdx.com.cn/products/data/data/g4day/{ymd}.zip`；源码声称逐日沪深北包、个股量为股、额为元 | 真实上游是通达信官网文件，不是 `a-stock-data` 数据 Provider，也不是官方 TdxAiData。DSA 当前没有已选的 `POST_MARKET_PACKAGE` Consumer；R07.16/17 暂停接入。源码自述历史样本与单位尚未通过本站独立请求核验。 |
| R07.18 巨潮公告 | [固定版 §7.1](https://github.com/simonlin1212/a-stock-data/blob/2e0ae6383c649b2bc5f68d3bc430d357f1c59ae7/SKILL.md) 的 `cninfo_announcements` 请求巨潮 `new/hisAnnouncement/query`，从 `announcementTime` 只输出日期 | 既有 `src/services/screening/candidate_context.py::fetch_stock_announcement_summary` 经 AKShare 调巨潮公告并供筛选上下文使用。固定版不保留精确发布时刻、历史修订或完整分页证据；先不增加同源适配，R07.19 暂停。公告索引不能证明公司行动事实。 |
| R07.20/22 问财检索 | 固定版 §2.3 声称 `https://openapi.iwencai.com`、`IWENCAI_API_KEY` 与 `X-Claw-*`，并给出研报/公告自然语言搜索代码；[官方 SkillHub 页面](https://www.iwencai.com/skillhub) 在本次只读访问中只返回需 JavaScript 的页面 | DSA 未找到该凭据或精确 Consumer 接线；官方接口合同、权限、数据许可、原始公告身份和发布时间未独立核实。保持待验证，不将自然语言结果接行情或公司行动事实。 |
| R08.1 free-stockdb 镜像 | [维护者镜像协议](https://github.com/hello245m/free-stockdb/blob/main/docs/DATA_SOURCE.md) 明说不内置数据地址，由 `--source` 或 `sync_url.txt` 指向镜像；清单 SHA-256 仅核传输完整性 | 未获维护者提供的可信镜像位置、来源链、覆盖和数据授权。R08.1 输出 `unavailable`，R08.2–R08.4 保持关闭。 |

## 门禁判定

G0-R 仍开放：上述公开源码审查只锁定候选身份和去重结论。腾讯、通达信、巨潮及问财的真实接口条款、响应/单位/时间/覆盖和目标 Consumer 准入未完成；free-stockdb 无可审核镜像。没有向目标容器同步代码，也没有改变 Provider 路由。后续若激活任一能力，先选择一个非重复的实际来源、资产与 Consumer，再按相应 R 叶和 G0-R 执行真实准入。
