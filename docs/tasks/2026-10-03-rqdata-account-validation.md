# RQData 账号注册与真实权限验证任务

> 任务标识：`rqdata-account-validation`
> 日期：2026-10-03
> 对应规格：[账号注册与权限验证](../specs/2026-10-03-rqdata-account-validation.md)
> 状态：已取消；官方入口与 SDK 预检完成，用户决定停止注册及试用申请。未提交身份信息、未认证或请求数据。

2026-10-03 后续检查点：注册页面已关闭。RQ02–RQ05 的执行义务由用户取消，后文未勾选记录只保留原计划与证据边界，不再等待用户输入。当前剩余工作转由[多源扩展验收任务](2026-10-03-multi-source-remaining-acceptance.md)执行。

## 执行基线

工作区为 ThesisLedger 及相邻 DSA、infra 三仓。本轮初始工作树分别有 987、303、19 条状态记录；保留全部既有修改，不提交、发布、清理或重建数据库。本轮串行执行。

共同价格交付以[旧 Task §0、§13](2026-09-25-multi-source-adjustment-aware-backtest.md)和[最终证据](evidence/2026-10-03-common-price-baseline.md)为准；Canonical 以[归档任务](../archive/tasks/2026-09-29-thesis-ledger-canonical-runtime-replacement.md)为准。旧记录中 RQData 的“无账号／跳过”由本次注册验证单独承接，不取消其他扩展的边界。

允许写入本 Spec/Task、相关导航和 TODO 的窄范围索引。注册仅操作官方页面；秘密通过既有安全配置入口，真实探针只读。生产适配、策略/准入修改、部署、付款及其他来源均不在本轮写集。

## 当前权限矩阵

| 证据项 | 当前状态 | 准确原因 |
| --- | --- | --- |
| 官方注册入口 | 已核实 | 官网“申请试用”进入 RQSDK 免费试用页面 |
| 注册账号 | 待用户 | 缺手机验证；页面说明注册即同意协议，由用户完成 |
| 试用申请／获批 | 未执行 | 尚未进入注册后的申请表，不假定注册即获批 |
| SDK 环境 | 已核实 | 目标 DSA：`aarch64`，`rqdatac 3.7.1`、`rqdatac-fund 1.0.44` |
| 真实认证／额度／期限 | 未执行 | 未获得有效账号或试用凭据 |
| ETF 行情身份及 `get_price` | 未执行 | 真实认证尚未就绪 |
| ETF 基金身份及 `fund.get_split` | 未执行 | 真实认证尚未就绪；独立于行情权限 |
| ETF `fund.get_dividend` 及分红币种 | 未执行 | 真实认证尚未就绪；独立于拆分权限 |
| 生产读取／目标 HTTP／冻结重放 | 未执行 | 须先根据真实权限及语义结果确定有界接入任务 |

## 执行叶

- [x] RQ01：核实官方免费试用入口及目标 SDK 前置。
  - 支持 AC01、AC02；不证明注册或认证成功。
  - 执行面与输入：官网、当前 Spec/Task、DSA 的隔离账号工厂及 R02.18 请求合同。
  - 验证：官网进入 `https://www.ricequant.com/welcome/trial/rqsdk-rqai-cloud`，页面选择 `RQSDK`；手机验证码入口、一次试用限制、自动注册登录及协议链接可见。
  - 目标只读命令：`rtk proxy docker exec thesis-ledger-dev-dsa-1 python -c 'import importlib.metadata as m, json, platform; print(json.dumps({"architecture":platform.machine(),"sdk":{n:m.version(n) for n in ["rqdatac","rqdatac-fund"]}}))'`。结果见权限矩阵；未初始化 SDK 或读取凭据。

- [ ] RQ02：完成账号注册及免费试用申请，取得准确开通状态。
  - 覆盖 AC01；依赖 RQ01 和用户提供的注册资料及亲自完成的确认。
  - 执行面：官方注册浏览器页面；写集为官方申请信息与本 Task 状态。
  - 当前停点：第一步手机验证。用户填写手机号、验证码、完成 CAPTCHA 并自行点击“登录/注册”；不由 Agent 接受协议。
  - 下一步：读取第二步真实字段，缺姓名、邮箱、组织或用途时询问用户；表单可准备后再由用户完成含协议的提交。需要新密码或邮件激活时继续交接给用户。
  - 完成条件：实际页面或确认邮件证明申请结果，并区分注册、提交和获批；若需人工审核，保留等待状态。
  - 证据：交接截图 `/private/tmp/rqdata-trial-registration-20261003.jpg`；浏览器标签已保留，后续不得刷新有未提交输入的页面。

- [ ] RQ03：通过既有安全入口验证真实认证和许可额度。
  - 覆盖 AC02；依赖 RQ02 实际开通及用户提供的有效 SDK 认证凭据。
  - 执行面：目标 DSA 单次隔离 SDK 初始化和 `user.get_quota`；仅使用当前安全凭据快照，报告只保留额度/期限白名单字段。
  - 上下文：DSA `data_provider/rqdata_client_factory.py`、`src/services/provider_credentials.py`、`src/services/provider_credential_revision.py`；现有 Control 的 `username_password` 加密入口。
  - 完成条件：一次真实认证与额度响应，记录 `license_type`、`remaining_days`、`bytes_limit`、`bytes_used`；认证失败或待开通时停止依赖请求，并记录不含秘密的准确原因。

- [ ] RQ04：核验目标 ETF 身份及原生日线实际权限。
  - 覆盖 AC03；依赖 RQ03，先验证合约身份，身份不匹配即停。
  - 执行面：目标 SDK 有界只读请求；规范证券 `159516.SZ`，候选合约 `159516.XSHE`，窗口 `2026-07-01..2026-07-07`，最多 5 行。
  - 上下文：DSA `data_provider/rqdata_etf_daily_contract.py`、`data_provider/rqdata_etf_daily_process.py`，原 Task 的 `R02.18-process` 及[隔离读取证据](evidence/2026-09-29-cont-r02-18-rqdata-etf-process.md)。
  - 验证：单次 `get_price`，`frequency='1d'`、`adjust_type='none'`、`expect_df=True`，显式 OHLC/量额字段、30 秒总期限；核实证券、返回日期、价格口径、原生单位与内容指纹。
  - 完成条件：逐项记录真实数据、空响应、权限错误及未知语义；本探针不授予整段历史覆盖或生产路由。

- [ ] RQ05：分别核验目标 ETF 拆分及分红接口。
  - 覆盖 AC04；依赖 RQ03 和基金身份核实，不依赖 RQ04 行情权限通过。
  - 执行面：目标 SDK 单基金只读请求；候选基金查询码 `159516`，分别调用 `fund.instruments`、`fund.get_split`、`fund.get_dividend`。
  - 上下文：原 Task `M29/M30`，DSA 基金事件 Reader 与 `data_provider/rqdata_fund_event_process.py`；[官方基金接口](https://www.ricequant.com/doc/rqdata/python/fund-mod)。
  - 验证：每接口一次、30 秒总期限及本地 2000 行预算；官方事件接口没有日期参数，取得单基金返回后明确本地筛选范围。拆分核对生效日/比例，分红核对登记/除息/支付日及每份税前金额，币种另查权威事实。
  - 完成条件：两接口分别记录权限及返回情况，缺公告时点和完整事件覆盖保持未知；空结果不能证明历史上无事件。

## 其余扩展交接

| 剩余范围 | 后续启动依赖与边界 |
| --- | --- |
| RQData 生产接入，R02.18-runtime/target、M29/M30 目标门禁 | 先完成本次逐接口权限和语义核验；按可用能力拆有界接入，再做目标 HTTP 与冻结消费 |
| 严格历史 PIT，S05 | 独立历史版本、决策可见时间及日历输入；账号或当前抓取不能替代 |
| 真实事件与份额，M23/M26/M29–M31/M33、G-M2-Events | 对应来源事件权限、身份/日期/币种及覆盖；先精确事件消费，再验实际记账 |
| 因子和本地派生，M25/M32 | 已核实的同源价格/因子、方向和锚点；Tushare 当前权限不足仍跳过 |
| 专业行情及辅助，G0-R、R02 Quote、M3 | 每个来源、资产与能力的独立权限/合同，按具体需要启动 |
| 不可变镜像发布、状态保真回退、Electron | 稳定输入及明确发布/设备验收范围；已完成代码同步不作为镜像发布证据 |

AKShare/EastMoney 暂不可用、Tushare 免费权限不足及 TdxAiData 付费/ARM64 不适配继续保留既有跳过状态。本轮不购买或重试这些来源。

## 一致性检查与检查点

规划预检：叶子、依赖、写集及 AC 映射已明确；RQ01 可完成，RQ02 等待用户手机验证与协议确认，RQ03–RQ05 待认证就绪。其他扩展保留原范围，不恢复共同价格任务的旧前置要求。

文档检查：本次五个文档的限定 `rtk git diff --check` 退出 0；新 Spec/Task 的 7 个本地相对链接全部存在，中文说明与任务状态已核对。只核验文档完整性，未运行应用测试；预检未改变应用运行输入。

最终验收尚未通过：AC01–AC04 的真实账号证据未取得，AC05 的最终下一叶需以权限结果确定。没有修改应用源码、策略、数据库或容器，没有调用 RQData 数据接口，没有提交或发布。
