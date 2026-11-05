# 第二优先级续接：价格失败定位与拆分原文复核

日期：2026-10-02。本轮继续M21-c2；其目标网络请求失败后，推进独立M22-c3原文及映射复核叶。后者已完成，第二优先级整体、M21/M22父项及真实事件准入/冻结门禁仍开放。保留三仓dirty WIP；未提交、推送、发布或修改生产策略。

## M21-c2：明确失败阶段并保留原文

上轮组合探针将EastMoney价格读取和目标容器访问深交所放在同一异常出口，未记录阶段或已取得响应；仅凭其ConnectionError无法反推失败端点。该历史异常继续保留，但端点归因未验证。

本轮在用户“继续”授权下，分别获取目标价格与宿主独立来源，先在Task登记一轮最多三口径×长/短两窗的预算。目标价格进程20秒外层硬期限，任一失败即暂停剩余同端点请求；实际只执行none长窗一次，立即在 `eastmoney_http` 阶段ConnectionError，未获得任何价格原响应。本次能确认失败发生在目标DSA访问 `push2his.eastmoney.com` 价格端点，不以它反推旧异常。未执行qfq/hfq或短窗、未重试、未轮换代理或上游。

宿主深交所独立HTTP读取成功，原文SHA-256仍为 `79ade4693bbd2084f89399199fa120f9559fdbe51659010b02819f29db478904`。原响应Base64与价格失败阶段固定于 `/private/tmp/priority2-m21-c2-capture.json`，捕获脚本 `/private/tmp/priority2-m21-c2-capture.py`。这些是只读观测产物，不是生产准入。M21-c2逐日量额/日期集合/长短窗价格坐标核验尚无合格价格原文，继续阻塞；不将上轮68条聚合成功升为完整单位或算法证明。

## M22-c3：真实目标拆分来源复核

固定 `159516.SZ`、`2026-01-01..2026-08-09`，目标DSA执行已有 `fetch_fund_split_observations`，最多4页、独立进程30秒硬期限、一次读取，无失败重试。实际2026年第1页83行，全年度目录分页1页；目标行两条，源折算日为03-27与07-09，每份比例2。Reader保留 `effectiveDate=null/effectivePhase=unknown`，不把源日期直接当除权日。

分页清单内容摘要 `39f3575f37c8533470802c0626d99e3c843b224b7cb119c65a04867bd8d1dfd5`，providerRevision `eastmoney-fund-cf:b1effe1fd7b9ca8b9ba169c7e65c561d1308b5ca85cbf2fc3bada67bd2f12398`，均与9月28日观测一致。此次观测时刻为2026-10-02T14:20:13.166999Z。两次一致只证明当前内容稳定观测，不证明历史删改全集。

传输 `paginationComplete=true,historicalRevisionsVerified=false`，业务 `coverage.complete=false`。捕获保存的是Reader解码后的UTF-8文本及摘要，不冒充未解码HTTP字节；文本SHA-256 `f3ac7d8dcd74cc34a7f2c32b3996fa0eb0cce165461f3fa94ff07caaf7d9e909`。文本Base64、分页清单及原始目标观测固定于 `/private/tmp/priority2-m22-source-capture.json`，获取脚本 `/private/tmp/priority2-m22-capture.py`。

## 独立实施公告与映射草案

两份原始管理人公告在本轮分别一次有界HTTP读取，均200；原字节SHA-256与已核原件一致，未重新签发历史披露时刻。

| 实施公告 | 字节 | 原字节SHA-256 | 核实的登记／除权／比例 |
| --- | ---: | --- | --- |
| [2026-03-24实施公告](https://static.cninfo.com.cn/finalpage/2026-03-24/1225024265.PDF) | 101064 | `8c79b77770e5bd9f853789a83c68981cb2a62735e2182540f3f3299a1bb02359` | 03-27／03-30／1:2 |
| [2026-07-06实施公告](https://disc.static.szse.cn/disc/disk03/finalpage/2026-07-06/f85c28ad-046c-4b29-96c3-142bf21dec58.PDF) | 101074 | `a758c693cd24aa4eeeac3d4de9492ac637e7d0206d7ac0b10469901db7a39fd6` | 07-09／07-10／1:2 |

按现有 `split-date-mapping` 契约生成[映射JSON草案](2026-10-02-m22-159516-split-mapping.json)，文件原文SHA-256 `b1a4f03f94faf27acf95d2bef9d508ec06eabec1280e04c921bb677154f5fe8e`。草案逐事件绑定真实symbol、源转换日、比例、登记日、除权日、实施公告日期、URL与PDF摘要；未部署到目标受控证据存储，未写入任何生产准入记录。

公告日期不是精确披露/历史可见时刻。该映射仅解释日期和比例，不构成复权价格基准等价、来源完整覆盖或严格PIT资格。

## 离线合同核验

用本轮真实目标观测和映射原文调用已有 `resolve_split_mapping_observations`。该函数要求准入快照，因此仅构造隔离的离线审核上下文（`offline-review://`），未消费或签发目标生产准入。两条结果除权日期为03-30、07-10，源日期/比例及本次observedAt保持一致；没有availableAt或strategyVisibility，原Reader业务覆盖仍false。

运行 `.venv/bin/python -m pytest tests/test_thesis_ledger_split_mapping_v3.py tests/test_thesis_ledger_mapping_evidence_store.py -q`：31 passed、2条依赖弃用警告，日志 `/private/tmp/priority2-m22-offline-guards.log`。既有守卫包含日期、比例、范围、摘要错配、重复映射和证据存储约束；这次通过属于离线合同层，不能替代真实鉴权事件HTTP、目标准入、冻结或Worker。生产源码/依赖/数据库结构未修改，不运行全包或部署入口。

## 下一前沿

2026-10-02 用户调整执行范围：AKShare、EastMoney 的 M21/M22/M23 未完成部分统一保留为 TODO、暂不可用并从当前顺序跳过。下述恢复条件留作后续待办，本轮不再推进这些来源；第二优先级转到其他来源的前置条件核对。

M21需要目标价格源可用并取得逐日原文后，再完成单位/日期/基准验证及作用域消费。M22当前已具备真实映射草案，下一叶必须建立可审核的事件覆盖边界与生产准入条件，再验证目标受控文件、事件HTTP、冻结原文和撤销；不能把现有恒为false的覆盖直接改为true。M23分红完整覆盖、M25可靠因子、其他账号接口权限与独立备用仍保留原阻塞，未借本次日期映射结果关闭。
