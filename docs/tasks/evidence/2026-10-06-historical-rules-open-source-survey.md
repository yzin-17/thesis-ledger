# 历史收费规则公告监测开源方案调研

> 调研日期：2026-10-06（Asia/Shanghai）。范围：GitHub 开源公告发现、网页修订监测，以及可用于历史收费整理的现成能力。
> 对应：[原 Spec](../../specs/2026-09-16-backtest-real-historical-market-rules.md)、[原 Task](../2026-09-16-backtest-real-historical-market-rules.md)、[已有来源核验](2026-10-06-historical-rules-t1-qualification.md)。
> 实际工作：读取项目 README、许可证和相关路由源码，检索官方项目文档；没有安装、启动、部署或创建定期任务。

## 调研结论

公告发布及页面修订发现有现成开源方案，适合复用。当前本人本地研究场景建议先试 changedetection.io：配置官方公告目录、过滤关注内容并查看差异。RSSHub 已有相关政府、交易所路由，可作为已有栏目订阅或后续程序接入的候选。

本轮没有找到并验证一套同时提供完整 A 股历史费用、生效区间、适用性、最低额/舍入和官方来源证明的现成系统。公告发现工具产生的是待核验线索；规则提取、来源对账和版本化收费表仍由本主题负责。这是本轮有界检索结论，不是声称 GitHub 上不存在其他实现。

## 候选方案与适用边界

| 项目 | 已核能力 | 对本项目的用途 | 取舍与许可证 |
| --- | --- | --- | --- |
| [changedetection.io](https://github.com/dgtlmoon/changedetection.io) | 官方 README 描述文本差异、CSS/XPath 选择、JSONPath/jq、普通 HTTP 与浏览器抓取、PDF 变化及通知；官方文档有 API | 监测官方公告列表、规则正文修订；过滤列表和目标字段，保存差异并产生待核验线索 | 当前首选试用候选，适合本人用界面配置少量来源；动态页面可使用浏览器抓取，需额外运行资源。已读 LICENSE 为 Apache-2.0 |
| [RSSHub](https://github.com/DIYgod/RSSHub) | 已实际检查当前仓库相关路由源码，包含税务、证监会、发改委及上交所业务规则 | 将已适配公告栏目变成 RSS，程序读取条目标题、链接和发布日期 | 已有路由可减少自写栏目适配；是否覆盖收费栏目及当前官网可抓取需逐项实测。当前 LICENSE 为 AGPL-3.0，建议按独立订阅服务评估 |
| [urlwatch](https://github.com/thp/urlwatch) | 官方文档描述 CSS/XPath 过滤、网页/命令结果监测、差异输出和自定义差异处理；读取 README 与 COPYING | 少量静态官方页面的轻量监测，结果可以交给本地处理程序 | 适合偏好 Python/配置文件的实现；执行周期由调用它的调度安排。已核 COPYING 为 BSD-3-Clause |
| [Huginn](https://github.com/huginn/huginn) | README 与 WebsiteAgent 源码描述网页/XML/JSON 提取、变化事件、RSS 和事件编排 | 将公告发现、过滤、归档等动作串成流程 | 能力更广，但增加独立编排平台；本次仅需少量收费来源监测，优先考虑前述方案。已读 LICENSE 为 MIT |

changedetection.io 的 API 见[官方文档](https://changedetection.io/docs/api_v1/)，新增内容识别见[官方说明](https://changedetection.io/tutorial/how-monitor-website-new-content)。urlwatch 过滤和处理能力见[官方文档](https://urlwatch.readthedocs.io/en/latest/)、[差异处理说明](https://urlwatch.readthedocs.io/en/latest/advanced.html)。Huginn 的抓取与事件能力见[WebsiteAgent 源码](https://github.com/huginn/huginn/blob/master/app/models/agents/website_agent.rb)。上述链接均为项目自身文档或源码。

## RSSHub 中实际找到的相关路由

本轮读取默认分支仓库源码归档并检查相关文件，以下是代码中存在的路由，不是当前官网端到端通过证明。

| 来源 | 源码及路由 | 本主题相关性 |
| --- | --- | --- |
| 国家税务总局最新文件 | [latest.ts](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/gov/chinatax/latest.ts)，示例 `/gov/chinatax/latest` | 可用于发现税务文件；仍需确认栏目能发现证券交易印花税相关调整及正文/附件 |
| 上交所业务规则 | [sselawsrules.ts](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/sse/sselawsrules.ts)，示例 `/sse/sselawsrules/latest`，支持类别参数 | 与经手费、收费指引最直接相关；必须选择业务规则栏目，上市公司披露路由不能替代 |
| 国家发改委政府信息公开 | [zfxxgk.ts](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/gov/ndrc/zfxxgk.ts)，示例 `/gov/ndrc/zfxxgk` | 可作为监管费政策发现候选，需测试文号、链接、发布日期和栏目覆盖 |
| 中国证监会政府信息公开 | [csrc.ts](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/gov/csrc/csrc.ts)，示例 `/gov/csrc/zfxxgk_zdgk/c101971` | 可按栏目 ID 选择信息公开内容；示例栏目不直接等于收费规则栏目 |

这些文件声明 `requirePuppeteer: false`，但不代表网页永远无需适配，也不代表该路由现在能够访问官网。本次还找到财政部国债专题、关税政策路由，以及深交所业务规则路由；国债/关税栏目不能据名称认定覆盖证券收费公告。

本轮未核到可直接用于中国结算股票收费通知的路由。中国结算应先作为 changedetection.io 的单独页面监测目标，或在取得官方栏目结构后评估新增适配。官网维护时，应记录抓取失败/维护状态；维护页面替换正常正文不能被提取成收费新版本。

## 建议复用路径

1. 先试 changedetection.io 监测少量明确官方栏目，选择公告列表区域，提取标题、链接、日期；以文号/链接和内容摘要识别新增、修订。测试关键词包括印花税、证券交易、过户费、经手费、监管费、收费标准；筛选不能丢失相关附件或一般性调整公告。
2. 对 RSSHub 已有的税务和上交所规则路由分别做真实栏目验证。能完整取得目标条目时可用 RSS 作为发现入口，原文仍取自官方条目链接；需要增加运行服务的成本单独评估。
3. 发现新条目后，将公告链接及原文取得记录送入待核验清单。人工核对适用业务、生效日期、费率单位、最低额和计费细节，随后更新本地收费表。
4. 回测继续按所需历史区间读取经核验的规则，冻结来源版本。监测工具的当前抓取时刻与公告的历史发布时间分别保留；RSS 的发现时间不能自动作为历史 `availableAt`。
5. 执行周期作为后续配置决定；当前讨论默认每日一次且包括周末。本轮没有实际设置调度、通知或自动化，也没有向任何外部渠道发送消息。

如果用户更希望费用更新完全融入 DSA、且来源都是可直接获取的 HTML/JSON，urlwatch 是另一条轻量候选。是否引入独立监测服务，先通过少量真实来源验证后决定；本轮不指定新增 Docker 服务或改动现有部署。

## 历史收费现成数据的检索边界

另外查看了 [AKShare](https://github.com/akfamily/akshare) 的项目说明和 GitHub 中 A 股费用相关实现。本轮检索没有确认 AKShare 存在满足本 Spec 的完整 A 股历史收费接口；不能将行情、期货费用或某回测项目固定费用参数计为本主题已经取得的来源。

部分回测项目展示佣金、印花税等固定费率，但本轮未核实它们具备候选历史窗口的全部收费变化、官方来源、最低额/舍入及历史可用时间。无需为复用普通费用计算另换回测框架；当前主仓已有五项费用及 Decimal 计算能力，独立缺口仍是经过核验的历史规则数据。

## 实际检查与剩余验证

实际完成：GitHub/官方项目文档搜索；五个仓库 README 与相关许可证读取；RSSHub 当前源码归档和四个关键路由文件检查。GitHub 匿名 REST API 返回限流 403 后停止该入口，改用公开仓库页面、raw 文件和源码归档读取；未读取凭证或修改账户。

未执行：安装、容器启动、真实监测任务、RSSHub 当前官网抓取、PDF/附件变化实测、调度可靠性、通知送达及 DSA 接入。因此本轮结论是候选能力适配，不是生产可用或收费资格通过。

后续最小验证范围：一个上交所收费规则栏目和一个税务文件栏目；验证新增条目、正文修订、页面无变化、抓取失败/维护页四类结果，并确认有效公告链接与原文可取得。此范围只验证公告发现，不代替历史收费完整性验收。

## A 股、港股和美股支持范围核验

用户要求确认三市场支持情况后，继续检查 RSSHub 当前源码中的相关来源路由，并查询收费发布机关的官方网站。结论分为工具能力、已核路由和完整历史费用数据三个层次。

| 能力 | A 股 | 港股 | 美股 |
| --- | --- | --- | --- |
| changedetection.io 通用网页/JSON/PDF 变化监测 | 可配置相关官方页面；未目标实测 | 可配置相关官方页面；未目标实测 | 可配置相关官方页面；未目标实测 |
| urlwatch 通用网页过滤及差异监测 | 可配置可直接获取的页面；未目标实测 | 可配置可直接获取的页面；未目标实测 | 可配置可直接获取的页面；未目标实测 |
| RSSHub 现成官方收费来源相关路由 | 已核税务总局、上交所业务规则、发改委和证监会路由代码；实际抓取待验证 | 本轮未核到直接覆盖港交所/香港收费政策来源的现成路由 | 本轮未核到直接覆盖 SEC/FINRA 收费政策来源的现成路由 |
| 可直接用于本项目的完整历史费用表 | 尚未取得并验证 | 尚未取得并验证 | 尚未取得并验证 |

changedetection.io 和 urlwatch 是通用网页监测工具，适用性取决于目标页面能否取得、选择器/过滤是否正确和动态内容要求，而非股票所属市场。因此三市场可以按来源配置监测，但本轮不把任意官网可抓取或完整政策发现能力标为已通过。[changedetection.io 官方关键词监测说明](https://changedetection.io/tutorial/how-monitor-keywords-any-website)及前文 urlwatch 官方文档支持这种工具能力判断。

RSSHub 的判断限于当前已检查的官方来源路由；源码存在与真实官网抓取分开记录。未核到港股/美股收费路由不等于 RSSHub 没有这些市场的其他行情、公司披露或新闻路由，也不等于不能新增适配。

### 三市场需要分别监测的来源

- A 股：税务部门印花税公告、上交所/深交所收费规则、中国结算过户费通知、发改委/财政部监管费文件。现有调研已取得部分收费历史依据，完整资格仍未通过。
- 港股：[港交所证券交易费用官方页面](https://www.hkex.com.hk/Services/Rules-and-Forms-and-Fees/Fees/Securities-%28Hong-Kong%29/Trading/Transaction?sc_lang=en)是交易费用与征费的明确入口，印花税的法定依据与历史调整还需核对香港税务部门及法规/公告。此页面提供当前说明，不能直接回填所有历史区间；对应历史通告、费率变化和精度规则仍需另取。
- 美股：[SEC Fee Rate Advisories](https://www.sec.gov/rules-regulations/fee-rate-advisories)提供 Section 31 历史费率公告入口；[FINRA Rule Filings](https://rulefilings.nga.finra.org/filings/)可发现 TAF 等规则变化；[FINRA TAF 指南](https://www.finra.org/sites/default/files/TAF_User_Guide_022615.pdf)是业务语义参考，但该版本年代早，不能据此声明当前或整个候选历史区间已覆盖。

美股必须区分监管机关向 SRO 征收、SRO 向会员收取与券商向客户转收。SEC [Section 31 官方基础说明](https://www.sec.gov/rules-regulations/fee-rate-advisories/section-31-transaction-fees-basic-information-firms)明确其法定义务主体为 SRO，客户金额不能仅从 SEC 费率公告直接推定。三市场的完整收费准入均要检查对应收费对象、交易业务、计费方式与历史生效范围，而非只找到费率数值。

这些官方页面和目录本次已通过网页检索取得；没有安装监测项目、执行目标抓取路由或核验三个市场的全费用清单。前文首选 changedetection.io 的建议限于公告监测候选，不能解释成该项目原生提供三市场历史费用数据库。

核验结论：三市场均可作为通用监测工具的配置目标；A 股部分现成 RSSHub 路由已核；港股、美股收费栏目适配及三市场完整历史费用数据仍需独立验证。本次范围是研究候选能力确认，未扩大原 Spec 的首个 CN Stock 实施切片，也未修改任何代码或部署配置。
