# Tushare 页面配置路径保存与目标权限验证（2026-10-02）

## 授权与保存

用户要求处理已有 zsh Token 尚未进入目标页面配置的问题。仅在宿主进程内读取已加载的 TUSHARE_API_KEY，经前端使用的同一 Server 配置接口保存；没有输出 Token、请求头或原始接口消息，也未将 Token 写入文档、脚本、环境文件或容器环境。未操作浏览器表单，本证据证明配置 API 链路及目标持久化，不替代真实界面验收。

- 保存前 `GET http://127.0.0.1:3000/api/market-data/providers` 返回 HTTP 200；Tushare configured=false、credentialSource=none、configVersion=2。
- `POST /api/market-data/providers/tushare/config` 使用现有 `credentials: { method: 'token', values: { token } }` 合同；HTTP 201，configured=true、credentialSource=control、configVersion=3。
- 保存后同一 Server registry HTTP 200；enabled=true、credentialConfigured=true、credentialFieldsConfigured.token=true、credentialMethod=token，updatedAt=2026-10-02T14:55:45.529674+00:00。
- 目标 DSA 的现有 `provider_credential_snapshot('tushare')` 可读取页面凭据，source=control、configVersion=3、credentialVersion=3。只读 SQLite 检查确认密文存在；没有输出密文或解密值，没有直接改数据库。

路径为现有 Desktop 配置 API → Server MarketControlService → DSA Control 加密存储，页面配置优先于环境配置。无需修改 TUSHARE_TOKEN 或重建容器。保存成功不授予接口权限、路由准入或完整覆盖。

## 三接口目标只读验证

使用目标实际保存的不可变凭据快照，向 `https://api.tushare.pro` 各请求一次；不重定向、不重试，每次外层硬期限 20 秒、连接/读取预算 5/12 秒、响应上限 1 MiB。仅记录状态、字段名、行数、原响应摘要及观察时刻。每次读后快照与读前一致，没有写策略、准入或 Run。

| 接口 | 样本 | HTTP / 业务码 | 行数 | UTC 观察时刻 | 原响应 SHA-256 |
| --- | --- | --- | --- | --- | --- |
| fund_daily | 159516.SZ，2026-07-06..13 | 200 / 40203 | 0 | 2026-10-02T14:56:52.148476+00:00 | 76f640af53f521f369bc82b3a3f3da7084a08acf25aeceb24877945abd842e90 |
| fund_adj | 159516.SZ，2026-07-06..13 | 200 / 40203 | 0 | 2026-10-02T14:56:52.688411+00:00 | a0362f7d67d3b9e3e1973b72926f23bb84aac6ce3c02f32b8a834d161b494b06 |
| fund_div | 510300.SH，单基金 | 200 / 40203 | 0 | 2026-10-02T14:56:52.734499+00:00 | 3997c987358ea410d6a48608ef2e59bed0b69ffe75828a66a7f87e22826c05be |

三项均分类为接口权限拒绝；未区分积分不足、接口未开通或其他账号限制，零行不解释为无行情、因子或分红。相比宿主历史探测，本轮新增目标页面保存及目标凭据读取证据，没有取得权限开通证据。M24-b3/M25-c/M26-c 继续开放，权限出现明确变化之前不重复请求。

## 当前执行决定

用户确认当前使用的 Tushare 免费版本不提供上述三个基金接口能力，要求记录并跳过。M24/M25/M26 尚未完成部分保留为 TODO、当前免费版本不支持、当前跳过；依赖这些接口的 Tushare 派生路径同步暂停。页面凭据及已完成实现保留，不再按相同条件请求，版本或权限改变后重新核验。免费版本限制来自用户确认；本轮接口直接证据为 40203 权限拒绝，不把该结论外推到其他账号、版本或股票接口。

## 验证边界

已完成配置 API 保存、registry 读回、目标密文存在性、实际凭据快照及逐接口只读验证。没有源码/依赖/Schema 变更，不运行单元测试、build 或部署。更新 Task 和 DSA 来源门禁后检查引用与 `git diff --check`；前端下次刷新可读取新的页面配置状态，未宣称已验收浏览器显示或基金数据正向读取、冻结、回测。既有未提交工作保留。
