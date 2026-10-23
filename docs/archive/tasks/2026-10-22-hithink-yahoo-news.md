# HiThink 新闻接入与 Yahoo 验证任务

规格：[HiThink 与 Yahoo 新闻](../../specs/2026-10-22-hithink-yahoo-news.md)。责任：当前主代理；保留三个仓库其他未提交工作，不创建提交。

## 当前检查点

五个实施叶全部通过并归档。497 项 DSA、6 项前端、维护 Node 5/Python 8、build 和边界通过；正式快更、HMAC 首次准入、目标 V3/Market/Web、九文件摘要与前后保全通过。政策/DSA 170，CN 新闻为 HiThink 首源、AKShare 备用，其余十七条不变。Yahoo `Search.news` 宿主/目标 NVDA/AAPL 返回 5/4 条，Ticker 路径 404；未新增其路线。完整记录见[DSA 证据](../../../../daily-stock-analysis/docs/tasks/evidence/2026-10-22-hithink-yahoo-news.md)。

## 执行清单

- [x] HN1：HiThink 来源执行面。新增有界首屏新闻读取、元数据投影和精确绑定，沿用 HMAC 与当前快照；补风险路径测试。对应 HN-AC1。
  - 输入：DSA `thesis_ledger_sources/hithink.py`、已有新闻执行器和新闻合同、官方分时新闻参数与真实探针。
  - 写集：DSA 新 HiThink 新闻读取/绑定及测试、现有 HiThink manifest、执行器业务限流事件与测试清单；通用新闻桥与专用搜索来源重新对齐 adapter 凭据校验所有权，原 Runtime 不变。
  - 验证：非法数据/时间/链接、超时/大小/重定向/HTTP 与业务限流、当前/失效凭据和未准入零尝试；不调用内部事件库。
- [x] HN2：消费面显示实际来源。修改现有新闻侧栏文案、来源显示和对应组件测试，保持共享合同及 TanStack Query。依赖 HN1 的稳定字段。
  - 验证：HiThink 来源中文标签、有限覆盖和原 CN/US 输入、取消/失败恢复；Desktop build。
- [x] YN1：Yahoo 真实验证。核对官方 SDK 的 Ticker/Search 路径，在宿主及目标读取公开样本，记录状态、结构与有效元数据，不写配置或 Cookie。对应 YN-AC1；可与 HN 实施独立推进。
  - 写集：仅本次私有元数据回执和统一证据；结果不自动生成 Yahoo 准入或路线。
- [x] HN3：首次准入与目标部署。扩展 infra 已有新闻维护配置档，增加 HMAC 凭据的事务内保护；本地门禁后正式备份、快更、首次准入和 CN 新闻首源调整。依赖 HN1/HN2。
  - 写集：infra 现有新闻首次准入入口与测试；目标只新增 HiThink 新闻证据/准入，并调整原 CN 新闻目标顺序。
  - 验证：默认计划只读、目标/锁/摘要/范围与并发凭据变化、真实 V3/Market/Web、原配置/数据/路线差集。对应 HN-AC2/3/4。
- [x] HN4：最终复核和归档。整合 HiThink/Yahoo 各自结论、原证据复用边界和保全结果，更新总表及来源矩阵。依赖 HN3、YN1。

## 复用边界

共享 `news-search-v1`、Market API、原 AKShare 与 NVIDIA 的未变合同及真实消费不重复测试。新增来源、业务限流、首次准入 HMAC、侧栏显示与目标部署分别补验；宿主探针不替代 HiThink 的目标消费，也不替代 Yahoo 的目标结果。

## 最终一致性 Review

结论：通过。HN-AC1～4 与 YN-AC1 的来源、控制/快照、接口、时间、首屏覆盖、错误、副作用、目标一致性与保全均有适用证据，见[唯一最终复核](../../reviews/2026-10-22-hithink-yahoo-news-final-review.md)。未发现未处理的阻断问题；Yahoo 业务接入和目标故障切源不属于本次验收范围，研究模型条件保持。所有变更未提交，其他工作区修改保留。
