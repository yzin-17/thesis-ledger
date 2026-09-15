# 数据源即时启停与页面凭证配置

> 任务标识：market-provider-credentials
> 日期：2026-09-14
> 状态：代码与本机部署验收完成；真实凭证在线验收待完成
> 对应任务：[实施任务](../tasks/2026-09-14-market-provider-credentials.md)

## 背景与范围

数据源启用开关目前只修改页面草稿，需要另行保存；需要凭证的来源读取 DSA 环境配置，控制面的加密凭证尚未接入实际适配器。目标是使启停即时保存，并通过页面管理 Tushare、TickFlow、Finnhub、Alpha Vantage、Longbridge 凭证。

生效范围是 ThesisLedger 数据请求与连接测试，沿用一套共享 Provider 配置。DSA 独立分析任务、移动端配置及远程 OAuth 回调不属于本次交付。

## 交互契约

- 切换启用状态立即提交，保存期间锁定该来源操作；其他来源仍可操作。失败恢复显示并重新查询服务端，避免超时后误判最终状态。
- 列表移除“保存设置”，提供“配置凭证”“测试连接”“移除”。分别显示启停、凭证来源与连接状态。
- 凭证侧栏复用现有 Sheet 与表单组件。单密钥来源分别使用 Token/API Key；Longbridge 提供 OAuth 和三项密钥方式。
- 凭证写入后不回显。留空保留已保存字段；首次配置或切换认证方式必须提供完整凭证。草稿测试不落库，修改草稿使旧测试结果失效。
- 保存凭证只证明持久化成功，连接测试独立证明当前权限和可达性；外部服务临时故障不阻止结构合法的凭证保存。
- 页面配置优先、环境配置备用。页面凭证存在但无效时不得静默使用环境账户；显式移除页面凭证后恢复环境配置，没有环境配置则为未配置。

## 接口与领域边界

- 现有 Provider config 接口改为部分更新；缺省 enabled、settings、凭证均保留原值。启停请求不得触碰凭证。
- 结构化凭证由 DSA 声明与校验，返回字段配置状态、来源和配置版本，不返回 secret。ThesisLedger Server 只转发，不存储或解密 Provider 凭证。
- DSA 以加密 SQLite 为页面凭证事实源，按配置版本为运行时注入有效配置并刷新受影响实例。旧请求和晚到授权不得覆盖新配置。
- 连接测试必须使用指定来源及草稿/有效凭证，不使用其他来源回退或业务数据缓存冒充成功；保持真实测试与 fixture 证据区别。
- 默认保留现有环境配置和历史数据。DSA 表结构采用增量升级；主仓无需增加 PostgreSQL 业务表。

### 凭证接口约定

配置请求新增 `credentials: { method, values }`；Tushare 的 `method=token`、字段 `token`；TickFlow、Finnhub、Alpha Vantage 的 `method=api_key`、字段 `apiKey`；Longbridge 手动配置的 `method=legacy`、字段 `appKey/appSecret/accessToken`。OAuth token 只能由授权内部接口写入，普通配置接口拒绝直接提交 OAuth token。旧单字符串 `credential` 接口保留其原有语义，不将历史未生效的环境来源凭证自动激活。

清单新增 `credentialSchema`（方法及字段元数据）、`credentialSource`（`control/environment/none/built_in`）、`credentialFieldsConfigured`（可保留的页面字段布尔值）、`credentialMethod`（已保存页面方法，其余为 null）与 `configVersion`。普通配置成功使 configVersion 单调递增，凭证另外维护内部版本以拒绝晚到 OAuth/刷新写入；修改启停不使正在授权的会话失效。凭证响应不返回 values。持久化采用带格式版本的加密 JSON，兼容历史密文而不破坏环境配置。

## Longbridge 浏览器授权

- 覆盖本机与本机 Docker；使用登记的 `http://localhost:60355/callback`，Docker 只向宿主机回环地址发布端口，并保证容器内监听可达。
- 维护固定官方 SDK 版本的最小扩展，使令牌加载、刷新保存和回调监听地址可注入。页面 OAuth 使用加密存储并禁用默认明文缓存，不影响独立 DSA 环境认证实例。行情能力继续复用官方 SDK。
- 页面输入 Client ID，展示登记回调地址，点击“授权并保存”后打开系统浏览器。创建、查询、取消接口返回会话状态，不返回 access/refresh token 或 Control Token。
- 验证 state 与 PKCE；每来源同时最多一个待处理会话，十分钟过期。取消、拒绝、超时保留原配置；成功原子保存并生效，不需二次保存。
- 刷新令牌加密持久化，刷新失败显示需重新授权。移除本地授权不宣称已在 Longbridge 侧撤销授权。
- SDK 接入须先证明目标版本及平台可构建、令牌刷新能持久化；若实际源码能力与上述设计冲突，先更新本 Spec/Task 的执行方案，不得静默改用明文缓存或虚构授权成功。

### 授权接口契约

ThesisLedger Server 将以下接口转发至 DSA 同名 control 路径，维持现有 Control Token 边界：

- `POST /market-data/providers/longbridge/oauth/sessions`：输入 `{clientId}`；创建会话，不等待用户浏览器回调。
- `GET /market-data/providers/longbridge/oauth/sessions/current`：返回 `{session: 会话或null}`，用于关闭侧栏后恢复当前待处理授权。
- `GET /market-data/providers/longbridge/oauth/sessions/:sessionId`：读取会话。
- `POST /market-data/providers/longbridge/oauth/sessions/:sessionId/cancel`：取消指定会话，终态请求保持幂等。

会话公开字段为 `sessionId/providerId/status/authorizationUrl/expiresAt/errorCode`。状态集合为 `starting/authorizing/succeeded/failed/cancelled/expired`；前两项为待处理状态。授权 URL 仅待处理会话返回，终态清除；URL 必须是 SDK 官方 HTTPS 授权地址。失败仅返回稳定错误码，不回传 SDK 异常或令牌。普通查询不能延长过期时间。

内部 OAuth 凭证以 `method=oauth`、`values={clientId,tokenJson}` 加密保存；`tokenJson` 使用 SDK 的令牌结构。授权完成和刷新保存必须在同一事务中检查当前凭证版本，取消、超时、移除或重新配置后拒绝迟到写入。SDK 缺少加密存储扩展时返回明确不可用状态。应用启动将遗留待处理会话收敛为失败，不能把数据库记录误认为仍有监听进程。

## 验收标准

- AC1：启停即存、刷新保留，失败与并发不会造成错误状态，凭证及其他设置不受启停影响。
- AC2：五个来源可完成手动凭证保存、留空保留、替换与清除；认证方式和字段合法性由后端验证。
- AC3：新请求使用新配置，页面优先及环境恢复符合契约；旧请求和晚到授权不覆盖新配置。
- AC4：接口、日志、浏览器持久缓存和默认 SDK 缓存均不泄露页面密钥；密钥缺失及解密失败保持明确错误。
- AC5：草稿测试不落库、不回退、不命中业务缓存；测试状态明确区分认证、权限、限流和网络错误。
- AC6：OAuth 成功、拒绝、取消、超时、重放、端口冲突、迟到结果、令牌刷新及重启恢复均符合契约。
- AC7：目标 Docker 与浏览器完成持久化操作闭环；五个来源分别记录真实在线结果，缺少凭证或权限的场景保持未通过。

## 验证策略与约束

按定向测试、包级测试与构建、仓库门禁、目标运行时逐级验证。模拟测试、SDK 构建、真实 Docker、浏览器交互与在线数据分别记录，不互相替代。所有未提交的既有修改保留。

规划审查：范围、接口所有权及阶段验收已明确。OAuth SDK 接入存在编译与平台风险，T3a 单独验证；真实授权依赖有效 Client ID 和用户完成浏览器授权，缺失时只阻塞对应真实验收。
