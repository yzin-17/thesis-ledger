# 冻结研究报告比较验收

对应原 Task 的 T10 / RA8。`GET /api/v1/research/reports/:id/comparison` 使用现有报告定位参数；`beforeId` 可选。两端分别检查 owner、可信范围及当前权限，在同一 `RepeatableRead` 事务内读取。显式跨模式/对象/账户/模板返回不可比维度；旧 V1 未记录的范围与版本保留未知。

默认前序按成功完成时间、UUID 降序，限定规范对象、模式、账户集合和模板；自定义问题按原问题区分。最多核验 200 个成功候选，未穷尽时明确“查找未完成”；数据库失败继续报错。成功时间未记录时不猜测前序。读取保持已有冻结/数值/Tool 关联核验，不更新历史任务。

观点逐字/字段、证据指纹、失效条件/交易日期限、资料质量/路由以及 Prompt/模型分开展示。证据保留前后报告引用入口。临时引用编号、提交编号、准备/权限确认时间与执行设置不冒充资料变化；完整冻结包摘要单列。比较函数只消费已授权投影，边界门禁禁止读取最新来源或发送通知。

## 已通过的证据

- **28 项定向测试**：稳定资料与临时编号、文字/Prompt/期限变化、资料和整包摘要分离、范围/模式/账户/模板、V1 未知、双端授权、扫描边界、数据库错误和损坏冻结包。
- **6 项真实 HTTP/PostgreSQL**：完成时间与 UUID 全序、不同模板筛选、显式选择、跨 owner 的相同拒绝、当前账户权限、跨模式、V1 原样保留、严格参数及只读性。种子由受控执行夹具及合成原始冻结/Tool 行建立，经真实 SQL/HTTP 投影读取。比较前后来源/受控执行请求计数及 AiRun 内容保持。
- 既有读取/兼容 **21 项**在前一组合运行通过，输入行为未变；不累计重复运行的测试。共享 Schema 全量 **104 文件 / 1,216 项**、Schema 构建、Server 类型检查、定向 lint/复杂度及架构边界通过。
- 修改模块均在尺寸阈值内；全仓尺寸扫描仍有 8 项既有大文件警告，该次扫描未提供基线，不将其描述为完整 ratchet 基线证明。

真实隔离验收从主仓执行：

```bash
node scripts/test-ai-provider-postgres.mjs \
  test/research/report-comparison-http-postgres.integration.test.ts
```

脚本使用已存在的 `postgres:17-alpine`、独立 tmpfs 库和 34 项 migration；最终退出 0。完整日志：`/tmp/thesis-ledger-t10-postgres-sealed-1792399277948.log`。独立只读查询确认该隔离测试容器剩余数为 0。

## 封存输入

| 输入 | SHA256 |
| --- | --- |
| `packages/schemas/src/research-comparison.ts` | `a95a5a0b239fd87f1825f9d2a5dd02c2b65b45baaec17c210bda942080a58b65` |
| `packages/schemas/src/research-read.ts` | `74366c68b8753941395a83e271c14edc822cabb0f809a6a9643bb6aa3c22c59d` |
| `apps/server/src/ai/ai-research-reports.query.ts` | `4c4322d4f1edb845174d3cba931bc3ecbcf2688a618a2389364b3f1b7725a8e2` |
| `apps/server/src/research/research-report-comparison.ts` | `1f25e3dee209e77153b400d567b4d0318f227df32235080b829f5248f131b290` |
| `apps/server/src/research/research-reports.controller.ts` | `319e9472db7bec2a40e227b48e82e9e92ccb7b6b97ac675ec12411ff4251e832` |
| `scripts/check-boundaries.mjs` | `b49a264215e2ea54dd56a87592d40fe763332e00c51bcc08712b2453ae0d7c32` |

此叶完成 Server 冻结比较；现有历史详情的 T11 消费、P2 复核和目标运行态仍按原 Task 接续。真实模型、目标来源、目标升级与恢复的既有授权条件保持。
