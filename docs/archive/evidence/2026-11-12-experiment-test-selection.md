# 实验测试候选选择验收记录

## 已核对问题

Desktop 详情及旧结果入口均在提交和按钮禁用条件中要求预选 ID；预选按钮只写入 ID，重复点击不取消。Schemas、API client、Mobile 动作凭据和服务端执行同样假设预选必填。

本次按[历史规格](../specs/2026-11-12-experiment-test-selection.md)调整为测试前可选预选，开始访问测试数据后保留锁定语义。该阶段状态由[任务](../tasks/2026-11-12-experiment-test-selection.md)维护；当前流程由[AI 实验自动完成](../../specs/2026-11-12-automatic-experiment-completion.md)接续。

## 实现范围

- Schemas 接受缺省／`null` 预选并规范为 `null`；保留批次人数和成员约束。API client 同步可选字段，Server 使用原可空字段锁定及揭示，技术重试比较批次与原预选（包括空值）。数据库结构不变。
- Desktop 两个入口复用 `use-experiment-test-selection.ts`，支持选择、取消、切换、移除联动和三人上限；只选择测试候选即可提交。按钮使用原共享 Button，增加选中语义和取消标签，没有新增样式。旧入口复用共享候选资格投影。
- 技术重试从已保存的 `exposure.preselectedCandidateId` 恢复提前选择，避免读取保护将 `selectedCandidateId` 隐藏后丢失原锁定意图；空值始终保留为空值。
- Mobile 同步可选预选、取消及移除联动，恢复操作凭据时比较完整集合和原预选。已锁定批次禁止编辑，未预选时仍可提交。原生依赖和工程配置未修改。
- 未预选的测试完成后不会自动采纳；正式采纳继续要求已查看测试结果的确认。隔离验证断言省略该确认时拒绝，真实正式采纳保持独立操作。

## 定向与构建

| 范围 | 命令或输入 | 结果 |
| --- | --- | --- |
| Schemas | `pnpm --filter @thesis-ledger/schemas exec vitest run test/optimization-finalize-selection.test.ts test/strategy-optimization.test.ts` | 24 项通过 |
| API client | `pnpm --filter @thesis-ledger/api-client exec vitest run test/strategy-optimization.test.ts` | 8 项通过，缺省和显式空值均提交 `null` |
| Desktop | `pnpm --filter @thesis-ledger/desktop exec vitest run test/experiment-test-selection.test.ts test/strategy-experiment-detail.test.ts` | 13 项通过 |
| Mobile | `pnpm --filter @thesis-ledger/mobile exec vitest run --dir test test/experiment-test-selection.test.ts` | 2 项通过 |
| 实验回归 | `pnpm --filter @thesis-ledger/server exec vitest run test/strategy-optimization` | 177 项通过，54 项隔离环境测试跳过；不将跳过算作通过 |
| 构建 | `pnpm --filter @thesis-ledger/api-client... build`、`pnpm --filter @thesis-ledger/desktop build`、`pnpm --filter @thesis-ledger/mobile typecheck`；Server 构建由正式隔离入口及快更执行 | 通过 |
| 静态检查 | 本次 Desktop／Schemas／API client／Server／Mobile 源码及相关测试 ESLint，`node scripts/check-boundaries.mjs`、`node scripts/check-file-size-guardrails.mjs` | 退出 0；尺寸保留 6 个存量警告，实验服务为 878 行，没有增长 |

首次 Mobile 类型检查发现 `exposure` 为未知字段及可选属性类型差异，改为显式读取冻结选择后通过。Mobile ESLint 输出第三方 React Native 的 Flow 解析诊断，但命令退出 0，未修改依赖或关闭规则；不据此声称 Native compile 通过。

## 隔离 PostgreSQL

从主仓执行正式维护入口：

```sh
RUN_STRATEGY_CENTER_T06_POSTGRES=1 node scripts/test-journal-review-postgres.mjs test/strategy-optimization/strategy-center-t06-postgres.integration.test.ts
```

最终退出 0，6 项通过。入口构建当前 Server 及依赖，新建仅本次使用的临时 PostgreSQL，核对数据库 `journal_review_fixture` 与 owner `fixture_owner`。初次成功执行全部 49 个 migration；最终复验时工作区另一个任务已新增竞技场 migration，隔离环境执行全部 50 个，结构 head 为 `20261112010000_autonomous_model_arena`。每轮结束均清理本次容器，没有修改目标业务数据库或 volumes；隔离结构通过不证明竞技场结构已部署。

覆盖显式空值和省略预选的锁定、测试、统一揭示；空预选技术失败后保持隐藏、拒绝补选／更换集合并复用已完成部分；已有预选批次、取消、缺失冻结依赖和租约恢复回归均通过。空预选结果揭示后，缺少查看测试结果确认的采纳请求被拒绝。

首次运行发现原 T06 使用旧 V2 回测样本，已被现行读取门禁排除，导致分组／直接读取断言失败。改用现有现行 V3 运行样本工厂，保留状态机与读取门禁本身；工厂增加可选指定 ID，其他消费者继续默认随机 ID。随后修复测试模型日期覆盖在解析前组装的顺序；最终全套通过，没有放宽生产读取规则。

## 实际浏览器

```sh
PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright node apps/desktop/scripts/check-experiment-test-selection.cjs
```

Edge 的 1440、1024、768、390 四宽通过。逐个实际点击并检查请求体：只选测试发送 `selectedCandidateId:null`；取消预选保留测试选择；切换预选、移除联动、满三人禁止批次外预选；键盘空格取消；受控失败后保留选择；成功后锁定；重试恢复原先被读取保护隐藏的提前选择。

每个宽度 3 次 POST 均由浏览器路由拦截为受控响应；其余写请求禁止，真实业务写入数为 0。页面无运行错误、无页面级横向溢出，表格在自身容器内滚动。截图 `/tmp/experiment-selection-qa/selection-{1440,1024,768,390}.png`，统计 `/tmp/experiment-selection-qa/results.json`；已人工检查 1440 与 390 截图。

首次浏览器启动缺少默认 Playwright 依赖，改用已有独立 QA 路径；之后修正验收脚本中的提示文字及专用重试按钮定位。没有改动产品错误处理来迎合脚本。

## 运行态同步与独立核对

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，无额外行为参数，首次退出 0。兼容预检、宿主构建、Server／Worker 替换及健康检查通过，镜像 ID 保持不变，属于容器可写层快更；没有执行数据库结构或外部卷变更。Desktop 本地静态资源已构建，浏览器验收使用当前 Vite 页面。

后续同入口预检拒绝：工作区新增 `migrations/20261112010000_autonomous_model_arena/migration.sql` 并修改 `raw-owned-tables.json`，与容器结构基线不一致。只读比对确认是另一个任务的竞技场结构输入。本任务没有绕过门禁、直接替换容器或擅自执行该结构升级。

最终构建后核对，本次 Server 与 Schemas 关键产物的宿主／Server／Worker 哈希均一致，已有成功同步覆盖最终功能代码：

| 产物 | SHA-256 |
| --- | --- |
| `apps/server/dist/src/strategy-optimization/strategy-optimization.service.js` | `c65a40631fc0948a8fcd987098dd0cc0029ddd269115744ae7a955317004c2b3` |
| Schemas 的 `dist/strategy-optimization.js` | `ed6865e9679cf2be5df631396f4cf4772bab37c5bf87aa3e5e39ea1cefe56b23` |

容器内只读调用实际加载的 `optimizationFinalizeSchema`，省略预选的输入规范返回 `selectedCandidateId:null`。没有向真实实验发送 finalize 或 adopt 请求。最初按源码布局猜测 `/app/packages/schemas` 路径时未找到文件，改用容器运行时包解析路径核对，不将路径探测失败算作部署失败。

## 最终结论

AC1—AC5 通过；本任务实施与证据归档，当前规格、旧流程规格和用户指南已同步。写集包括选择合同、实验锁定执行、Desktop 两个入口及共享选择状态、Mobile 动作与恢复、相关测试、浏览器核验脚本和本组文档。`git diff --check` 通过，没有新增跨领域依赖或模块导出旁路。

未将当前工作区全部检查或所有数据库迁移宣称为通过。Mobile 类型与动作凭据测试通过，未执行原生设备交互；无原生配置或依赖变化，Native compile 不适用。本次没有提交或推送，没有新增 AI 调用、真实封存访问或正式采纳操作。其他任务及既有未提交修改保持原状。
