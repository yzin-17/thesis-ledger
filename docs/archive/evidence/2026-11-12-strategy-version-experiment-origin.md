# 策略版本关联生成实验验收

日期：2026-11-12。对应[规格](../../specs/2026-11-12-strategy-version-experiment-origin.md)。

## 根因与修复

正式版本 `e0137741-0f5d-4da1-808b-8eb8852717b8` 的 `source` 已保存为 `kind=experiment`，引用原实验 `71bbc0a2-89ae-48eb-938f-0b7e534aecb2`；采纳记录也存在。原查询只匹配实验基线版本，Desktop 又传入 `sourceMode=existing` 并按基线重复过滤，导致从零探索生成的正式版本显示无实验。

服务端版本筛选改为匹配基线或现有采纳记录的正式版本，使用 `EXISTS` 保证同实验不重复；列表和总数使用相同过滤。用户、显式来源、搜索、状态和游标条件保留。不会扩大到同策略全部版本，也没有回填或修改数据。

Desktop 消费服务端关联结果，移除额外来源限制与基线过滤，并显示“生成此版本”或“基于此版本”。窄屏的实验名称和来源说明可换行。创建入口继续绑定当前版本，分页保留版本隔离。Mobile 当前没有该版本关联实验列表，未新增入口。

## 检查

- 隔离 PostgreSQL：`COMPLETED_ADOPTION_POSTGRES=1 pnpm --filter @thesis-ledger/server test test/strategy-optimization/completed-adoption.postgres.integration.test.ts`，4 项通过。每个样本验证基线、采纳 v1、采纳 v2 均关联原实验，总数 1、无重复、无下一页；同策略无关 v3 返回空，显式 `sourceMode=existing` 仍排除探索实验。
- Server 读取与采纳回归：2 个文件、16 项通过。
- Desktop `test/strategy-version-records.ui.test.tsx`：5 项通过，涵盖两类关系、创建入口、分页切换及迟到响应隔离。
- Server、Desktop 构建通过；4 个修改文件定向 ESLint 和 `git diff --check` 通过。
- 模块边界与文件尺寸检查通过；尺寸门禁仍报告其他既存文件的 5 个警告。本次不宣称全仓 lint 已通过，前一修复中记录的共享工作区错误未在此轮重复全量检查。

## 本地运行态与页面

在 `thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，退出 0；日志为 `/tmp/strategy-version-experiment-origin-sync.log`。Server/Worker 就绪，镜像保持不变，仅更新可写层；未进行数据库结构或卷变更。

宿主、Server、Worker 的 `strategy-optimization-read.service.js` SHA-256 一致：

`4fa3dff94ee5a3df0c6dde3cb91a1101bbbbd6fa85e37f5a140fa5ea8a56b1ca`

实际 GET `/api/v1/strategy-optimization/experiments?strategyVersionId=e0137741-0f5d-4da1-808b-8eb8852717b8&limit=20` 返回 200、总数 1，包含原实验，来源为 `discovery`。

1440、1024、768、390 宽度实际浏览器验证均通过：正式 v1 页签显示原实验一行及“生成此版本”，可打开原实验，浏览器返回后可再次读取，刷新页面后打开该页签仍能读取关联；无页面横向溢出或 JavaScript 错误。此次验证不扩大为页签刷新恢复能力的结论。窄屏说明文字未越出单元格，桌面和窄屏截图已目视检查。

脚本：`/tmp/verify-strategy-version-experiment-origin.cjs`；结果与截图：`/tmp/strategy-version-experiment-origin-qa/`。浏览器阻止全部非 GET 业务请求，记录为 0；没有真实采纳、数据修订或模型调用，没有提交或推送。

## 结论

AC1–AC3 通过。原正式版本已有来源事实保持不变，修复的是服务端关联读取与客户端展示。
