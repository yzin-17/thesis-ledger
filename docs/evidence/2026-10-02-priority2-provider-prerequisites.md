# 第二优先级剩余来源前置核对（2026-10-02）

## 范围与结论

最新执行调整：页面凭据保存与目标权限验证完成后，用户确认当前 Tushare 免费版本不提供 fund_daily/fund_adj/fund_div，要求跳过。M24/M25/M26 和对应 Tushare 派生路径保留 TODO，停止同条件请求；保留页面配置与已完成成果。见[配置、权限与执行决定](2026-10-02-tushare-page-credentials-target.md)。下文保留首次前置核对及其他来源的阻塞边界。

按用户要求跳过 AKShare、EastMoney 的 M21/M22/M23 未完成部分后，核对第二优先级其他来源的当前配置、已完成接线和阻塞。本轮未请求已跳过来源、未重试 Tushare 基金接口，未发布准入、修改账号、安装 SDK、改变镜像或创建 Run。完成前置盘点，不代表 M24–M34 真实来源验收通过。

## 首次前置核对的目标配置

后续状态：2026-10-02T14:55:45+00:00 按用户要求经页面同一配置 API 保存 Tushare 凭据，现 configured=true、credentialSource=control、configVersion=3；三个基金接口从目标读取该凭据各一次，仍返回 40203。下表保留 14:35 的首次观察，最新状态见[配置与权限证据](2026-10-02-tushare-page-credentials-target.md)。

2026-10-02T14:35:16.760842+00:00，在目标 `thesis-ledger-dev-dsa-1` 内以当前 Control Token 请求 `GET /api/v3/thesis-ledger/control/providers`，HTTP 200；仅输出脱敏状态，不输出凭据或请求头。

| 来源 | 目标状态 | 执行结论 |
| --- | --- | --- |
| Tushare | configured=false、credentialConfigured=false、credentialSource=none；configVersion=2，updatedAt=2026-09-14T14:33:31.806242+00:00 | 目标账号未配置。宿主环境存在 TUSHARE_API_KEY，zshrc 有对应声明；未复验 Token 内容或身份，没有新权限事实。此前 fund_daily/fund_adj/fund_div 的 40203 未解除，未在本轮重新发请求确认。 |
| RQData | configured=false、credentialConfigured=false、credentialSource=none；configVersion=0 | SDK 已安装，目标账号未配置；真实权限及目标正向消费缺前提。 |
| HiThink | configured=true、credentialConfigured=true、credentialSource=environment；configVersion=0 | 配置不证明分红进度码、历史覆盖或事件准入；不重复带凭据请求。 |

容器为 Linux aarch64、Python 3.11.16、glibc 2.36；已安装 tushare 1.4.29、rqdatac 3.7.1、rqdatac-fund 1.0.44、pytdx 1.72。`tdxaidata`、`tqcenter` 模块未发现。社区 pytdx 不能替代官方 SDK 或授权验收，服务健康不能代替真实来源验收。

主 Task §12.9 已记录 Tushare 身份 resolver、独立 wire、Server 消费、受控读取及事件本地接线完成，本轮不重做；真实范围、基金身份/分红币种审核、分页及历史覆盖继续归 M26-b2 和真实门禁。

## 公开合同复核

- [Tushare fund_adj 官方说明](https://tushare.pro/document/2?doc_id=199)现列基金代码、日期、adj_factor、offset/limit 参数和单次最多 2000 行；未明确目标基金因子锚点、方向及可转换算法，不完成 M25-b/M32-b2。未据此修改既有分段读取代码。
- [HiThink 分红页面](https://fuyao.aicubes.cn/docs/api-reference/fund-corporate-actions/)与[官方仓库说明](https://raw.githubusercontent.com/HiThink-Tech/Financial-API/main/docs/api/fund/corporate-actions-dividends.md)仍将 progress 列为字符串，示例“实施”，未给字符串 "2" 的码字典。两页当前仅列 thscode，与 2026-09-29 的 fund_type 必需说明有文档差异；未实测省略参数，不改变现有请求合同或未知进度拒绝规则。
- [通达信后台 SDK 官方说明](https://help.tdx.com.cn/quant/docs/markdown/mindoc-1hjbgqpdhv114.html)明确包名 tdxaidata、入口 `from tdxaidata import tqs`、原生动态库及 TdxAiData.ini 中数据服务 Key。[K 线说明](https://help.tdx.com.cn/quant/docs/markdown/mindoc-1ctuhthaq5qmg/mindoc-1h10g60jt68sc.html)明确 fill_data 默认 true、三种 dividend_type 和 ForwardFactor 限制；未据此授予单位转换或复权资格。官方权息页面读取超时，未重试或推定字段已核实。

## M34 候选包停止点

主 Task 先登记 M34-sdk-preflight 的独立只读预算。候选为 [PyPI tdxaidata 1.2.2](https://pypi.org/project/tdxaidata/1.2.2/)，页面记录 2026-09-30 发布、Python >=3.7，wheel 标签 py3-none-any。页面声明随包提供原生库，因此 any 标签不证明 ARM64 兼容；MIT 标记不替代数据服务授权或原生组件与镜像分发许可核对。

实际探针首次因宿主 Python 缺 requests 在网络调用前退出；改用 DSA .venv 后，一次固定版本 PyPI JSON 读取完成，随后唯一一次 files.pythonhosted.org wheel 下载在 TLS 握手阶段出现 ReadTimeout（连接预算 5 秒）。未取得 wheel 原字节，未保存或核验摘要/ELF 架构，没有安装、导入或执行下载内容；未重复下载或切换镜像源。M34-sdk-preflight 未完成，目标集成不启动。

## 接续条件与验证

| 路径 | 必须补齐的前提 |
| --- | --- |
| M24-b3/M25-c/M26-c | 目标账号配置和基金接口权限出现明确新事实，再逐接口有限核验；股票 daily 成功不证明基金权限。 |
| M25-b → M32-b2 | 可靠因子锚点、方向、算法与同源 raw 对齐证据。 |
| M29/M30 | 目标账号、ETF 映射/分红币种审核、逐接口权限和覆盖。 |
| M31 | 可信进度码释义或精确事件等价证据，以及完整覆盖。 |
| M27/M28/M34 | 固定 SDK 原字节、ARM64/ABI、许可及数据服务授权，再实施隔离集成。 |
| M33、G-M2-Events、G-M2-Price、独立备用 | 所需真实行情/事件及兼容前提；不能用本地合同通过代替。 |

本轮只有只读配置/模块存在性和公开资料核对；未执行代码测试、构建、部署或真实回测。更新后检查文档引用及两仓 `git diff --check`；既有未提交工作保留。
