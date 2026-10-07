# I01 完整响应 JSONB 位模式失配修复

## 根因证据

原 I01 第二次相同窗口创建的完整响应哈希冲突未保留字段差异；此前 `$queryRaw` 参数直入 JSONB 的 15 条合成 Bar 诊断零差异，但没有经过实际 ORM model。新增隔离诊断使用当前 `MarketWindowEvidenceV3Repository.record`、项目全部 migration 和显式命名的 loopback PostgreSQL。修前源响应与保存摘要均为 `b0f9b02c3027548362810a17e178801dd38966ba5d2fb62da51da8e4235d1115`，ORM 回读摘要为 `8a7dbd42b94c8cb05057ae8f13b72ea129c70fa7f52399685f749fb19c1a9a6e`；22 个 Bar 数值位模式各有 1 ULP 差异，非数值字段差异为零。首例在 `bars[1].high/amount`，也涉及 `open` 与其他金额；未输出完整响应或凭据。

## 修复合同

Market 证据持久化使用固定列、参数化 SQL：单条 `INSERT ... ON CONFLICT DO NOTHING RETURNING` 将严格响应的 `JSON.stringify` 文本转为 JSONB，连同原完整摘要原子写入；旧空载荷只在响应和摘要同时为 NULL 时按身份条件 `UPDATE`。重复身份仍核对来源事实与已存完整响应摘要；竞争填充、篡改或旧完整载荷摘要错误继续拒绝。没有四舍五入、减少哈希字段、改变严格 Schema 或自动覆盖历史。

## 验证层级

- 隔离 ORM 修后：新行、回读及同身份重记通过；原响应、保存摘要、回读摘要一致，数值和其他字段差异均为 0。扩展同一诊断覆盖旧空载荷填充，恢复后摘要一致且差异均为 0。每次运行都核对数据库名、owner、loopback/非默认端口；临时容器按精确 ID 删除并确认不存在。
- Server 定向：证据仓库/冻结 Reader/Bar Reader/Snapshot Builder 五文件 39 项，PIT 重建两个文件 44 项通过。`typecheck`、`build`、改动文件 ESLint/Prettier、import boundary 和两仓无关 WIP 不受影响；带 `GUARDRAIL_BASE_REF=HEAD` 的尺寸门禁退出 0，仅报告存量未增长警告。
- 源码变化后通过原隔离脚本执行完整 I01 组合 1 项：受控 DSA HTTP、实际 Reader/选择器/证据仓库、普通 HTTP 创建、BullMQ、生产 Worker 子进程、成功与受损快照失败终态、结果查询、16 张账户/记账域表隔离和离线重放。隔离 PostgreSQL/Redis `cleanup` 均返回 0，事后精确名称查询为空。
- Server 包级测试退出 0；此次有界输出未完整保留最终通过/跳过项数，不据此填造统计。独立 ORM 诊断和 I01 组合的通过不能替代其他默认跳过的数据库/公开原包用例。

## 保留门禁

该组合的 DSA 响应、策略与目录仍由受控 fixture 提供，不是 HiThink `159516.SZ` 真实读取或普通业务 Run 的来源资格。I01 Reader/数据库子门禁关闭，I01 父项依赖 D01、D03、S01、S07–S09 尚须分别验收。DSA 官方完整离线门禁既有重试失败，本次未第三次运行；目标容器没有同步或重建，真实 Provider、AI、浏览器/Electron 和 AC01–AC20 仍开放。
