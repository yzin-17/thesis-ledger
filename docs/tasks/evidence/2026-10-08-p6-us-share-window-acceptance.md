# 美股有界原价整股与TAF验收

关联：[P6 Task](../../archive/tasks/2026-10-07-p6-market-state-expansion.md)、[Spec](../../specs/2026-10-07-p6-market-state-expansion.md)、[输入资格](2026-10-08-p6-share-unit-input-review.md#美股有界输入里程碑)。本记录完成美股选定窗口，不授予港股历史整手、全市场原价、完整公司行动或严格历史PIT资格。

## 输入与合同

价格为已实际保存的Yahoo GME原响应，独立来源`yfinance/yahoo-gme-share-window`，US/STOCK/1d/none，仅2024-05-10～24。原字节SHA-256 `6bcb64233cc1a17afe6ef212f4803f71a4f2c250652ec91d15c27b64be8df989`；USD每股锚、后续604条事件/日线观察、官方报价规则和当前富途整股说明已核对。数字表示按一美分网格还原，误差界限USD0.000005；不做复权比例转换，市场总成交额保留null。

目标执行05-14～24，05-10/13只作两日真实预热；使用`whole-share-window-calendar-budget-v1`候选计划，真实日历、最少Bar、冻结与预算守卫保留。整数股模拟步长1与NYSE报价整手分开；原身份发生/可见时钟保持实际2026观察，只在精确来源和冻结identityOnly请求绑定的原价规则研究下使用研究dataAsOf。未知上市日/交易状态不推断为正常或历史已可见。

新Manifest使用`whole-share-window-cost-v1`整股基准版本；旧版本基准不可用分类和旧冻结结果不回填。基准按同一执行序列首末收盘和同份公共/富途收费，在含买侧费用的预算内买入最大整数股，保留余款，末日扣卖侧费用清算。

## 实际目标与独立金额

标准准备、创建、Worker领取及持久终态通过：

- 任务：`66c783b4-bd9c-40b1-b9ad-cba7731d533d`，succeeded，attempt1。
- Snapshot：`bd89c375736b414ac8b174baba3220c0a37637bdb2006d91b7e137a8e5ad55af`。
- 结果摘要：`e3da5f14382141cc`；7笔整数股成交、3笔已平仓交易、9个权益时点。
- 期末现金USD33281.28、持有2714股、期末权益USD84847.28、净收益`-0.1515272`。
- 策略总费用USD151.98：佣金73.18、平台费74.71、TAF1.01、Section31费3.08；逐笔计费后只入账一次。
- 基准2050股，买侧费用USD20.30、余款USD42.20、卖侧费用USD21.72、期末USD38970.48、净收益`-0.6102952`；净收益差`0.458768`。

Python Decimal独立核验全部冻结OHLCV与原响应网格、整数股预算、逐笔方向/数量/价格/各项费用、现金及9个净值、首尾基准预算/余款/收费和净收益差，完整通过。手续费取自当前富途研究预设与历史Section31/TAF源；不使用参考股价换算。TAF卖侧每股0.000166、每笔上限8.30及低价豁免冻结；Section31在05-20成交日切换，T+2收费结算语义保留。

生产Runner在当前Worker对该Snapshot两次断网重放，结果及摘要一致，fetch/http/https/net/tls均被拦截，网络0。23条更新前终态完整行摘要不变，17条旧成功V3各两次断网重放通过。

## 页面与实际导出

实际Safari访问`http://127.0.0.1:5182/strategy/jobs/66c783b4-bd9c-40b1-b9ad-cba7731d533d`：完成状态、USD84847.28、-15.15%、基准-61.03%、净收益差45.88%、7笔整数股成交一致；实际股数富途口径、TAF两段、原价/固定快照及未知状态清楚展示。

页面验收发现原价规则披露仍统一称基准未纳入，已按新成本版本修复：新结果显示整数股预算、保留余款和同份费用；旧原价版本仍保留不可用说明。沿用现有Alert组件和DOM，无样式或费用配置改动。锁定shadcn info/docs、现有组件及官方文档已核对；24项相邻Desktop测试、构建、类型与定向ESLint通过。前端开发资源重启/刷新后实际文案已复核，不把旧缓存显示计为通过。

通过真实“导出诊断JSON”保存`/Users/yzin/Downloads/backtest-66c783b4-bd9c-40b1-b9ad-cba7731d533d-diagnostics-v2.json`，SHA-256 `1162700dda46f8dbd5cdaf9d93a64f28831470c19614454e166928f9fc6f2d7e`；与当前持久API和完整客户端白名单映射逐字段深比较通过，Source时钟、TAF股数维度、收费日期、新基准成本版本及摘要保留。下载文件不是完整复现包，实际Snapshot重放另有上述证据。

## 门禁、部署与边界

最终DSA正式全门禁8254项、626子测试通过，1跳过/4未选；Server全包2575项通过/217跳过，Schema773项通过。受影响构建、类型、ESLint、边界及尺寸检查通过。源/生产网关、模型与基准、时钟及预热均有定向正反例；普通原价、现金、其他市场/证券、越界、无绑定及晚于研究截点仍拒绝。

正式`sync-code.sh all`、后续最小`thesis-ledger`和`dsa`同步均退出0；此阶段的`5260ad9aec56…`、`46b4ff775cbc…`镜像和可写层证据随后由下述U4正式固化补齐。临时路由选择每次均恢复，Desired修订37、选择与原配置一致；备份和原有源码/WIP保留，没有提交、推送或发布。

过程失败保留：两次准备blocked，首个创建`22580641…`因期初身份时钟适用性失败，未投递Worker；相应请求、失败记录和路由恢复日志不删除。新接缝分别补齐预热候选、网关精确研究日历和观察截点，不扩大价格范围、不回填事实时钟或放宽普通路径。

## U4：当前美股增量镜像与恢复

正式命令为`DEV_DATABASE_MODE=check PULL_SERVICE_IMAGES=false PULL_BASE_IMAGES=false ./scripts/update.sh all`。首次在构建前因沙箱禁止进程检查而退出，失败日志保留；获得执行权限后重试退出0，空间预检实测通过，冷构建完成。未降低容量门槛或改用直接Docker构建入口。

当前DSA镜像为`sha256:fa838c73b4be86d8638fc10fa2e8ee0f74546b8fe73e3d7f16c954da952d8725`，Server/Worker为`sha256:fa3baa3924d233ee66cdfcb0f28d782fbfd8c963b8896208d88dd0170fc8b60c`。五容器均健康，Server与DSA健康API均HTTP200。13份受影响Server/Schema编译文件及9份DSA源码/资格包/原响应逐字节摘要与宿主输入一致；新DSA实际读取11条原价、空市场成交额和原观察时钟通过。Desktop沿用上方本地构建与实际页面证据，不计为Docker前端镜像。

正式更新前后分别通过维护脚本生成`p6-us-share-accepted-before-image-20261008`、`p6-us-share-current-20261008`版本绑定恢复包，位于infra的`.maintenance-backups/`；七张关键表、全部成功任务摘要及DSA SQLite摘要完全一致。当前Worker内18条成功任务各两次断网重放，共36次，网络调用0、持久摘要全匹配；旧23条终态的保护仍成立。

使用当前恢复包和实际新镜像完成隔离恢复，结构head为`20261006030000_strategy_authoring_save`，七表摘要匹配、SQLite完整性通过。美股整股、ETF现金分红、港股四费、风险警示和退市五类样本各两次断网重放通过；源环境摘要不变，隔离容器与目录按脚本清理。此恢复包依赖本地对应镜像，不授予异地取回或旧版本组合回退资格。

最终一致性复核：U1～U4的真实输入、执行、页面/导出、镜像和恢复证据已逐层对应；金额、股数单位和新旧成本版本一致。仅关闭美股有界叶；港股历史每手股数仍缺原件，父E1/F3保持活动。

完整日志及机器结果在主仓忽略目录`.recovery-artifacts/m31-2026-10-07/`：`p6-us-share-target-after-observation.json`、`p6-us-share-replay.json`、`p6-us-share-independent.json`、`p6-share-old-protection.json`、`p6-us-share-download-check.json`、`p6-us-share-image-update-retry.log`、`p6-us-share-image-state.json`、`p6-us-share-image-inputs.json`、`p6-us-share-image-all-replays.json`、`p6-us-share-image-recovery.json`及各门禁/同步日志。
