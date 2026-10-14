# 策略编写可信身份

> 2026-10-06 用户明确目前无需登录验证。默认使用[策略中心本地工作区](2026-10-06-strategy-local-workspace.md)；本文的账号会话规则仅适用于明确启用 `STRATEGY_IDENTITY_MODE=account` 的部署。

## 目标与范围

自然语言策略 T01 需要可信 owner；现行本机/LAN 访问规则只有网关准入，没有个人 principal。新增身份模块拥有用户凭据、持久会话和身份验证，编写模块只消费验证后的用户 ID。正式策略归属、保存和来源权限由 T04 继续承担，不把本叶通过扩展为全应用多用户隔离。

用户可创建本机应用用户并登录；用户名规范化后唯一，密码至少 12 字符并使用带随机盐的 scrypt 保存。登录生成随机不透明会话凭据，数据库只存 SHA-256 摘要、用户引用、过期和撤销事实。会话在 24 小时后失效；禁用用户、过期或撤销均拒绝。相同 principal 登录后可恢复其草稿，退出撤销当前会话。

会话通过专属凭据头传输，经数据库验证后派生 principal；该头只携带不透明凭据，不接受自报 owner。既有 LAN Bearer 继续控制网关准入，不能代替个人身份。Desktop 会话凭据只在内存保留，重新打开应用需登录，不写 localStorage 或日志。接口不返回密码散列、盐或会话摘要。

## 模块与合同

`identity` module 提供注册、登录、读取/撤销会话和身份 Guard 的小 Interface；凭据处理与存储集中在 Implementation。`strategy-authoring -> identity`，身份模块不反向依赖编写、策略、AI 或其 DTO。密码校验、会话恢复和 Guard 通过同一 Interface 测试；共享 Schema 仅定义公开输入和 principal。

新增 migration 保留业务数据，只追加用户/会话表。现有 authoring owner 字段继续接收可信字符串；新 HTTP owner 为已验证用户 UUID，正文和查询中的 owner 不被接受。既有底层 repository fixture owner 不冒充 HTTP 用户。

## 验收

- I-AC1：实际密码验证产生用户 principal；无/伪造/过期/撤销凭据拒绝，相同共享网关 token 不造成用户合并。
- I-AC2：注册用户名唯一；输入有界、密码散列/盐/摘要不出现在响应或日志；登录错误不区分不存在和错密码，限制密码计算并发及登录请求频率。
- I-AC3：双用户草稿创建、读取、更新、列表和丢弃隔离；不能通过 owner 正文、查询或普通身份头越权。修订冲突、关闭状态和旧 repository 合同保持。
- I-AC4：Schema、定向 HTTP/存储、类型/build、边界、migration matrix 和打包检查通过；隔离 PostgreSQL 后再升级目标。客户端、正式策略归属和在线模型由后续独立叶验收。
