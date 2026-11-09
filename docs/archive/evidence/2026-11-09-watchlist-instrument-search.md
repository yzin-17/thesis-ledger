# 自选添加标的搜索修复验收

## 问题与修复

真实目录接口能返回招商银行 `600036.SH`。Desktop 添加弹窗却直接将包含名称、拼音、别名和搜索排序元数据的完整结果交给 `watchlistInstrumentSchema`，该严格 Schema 只接收五个身份字段，导致正常目录结果全部被过滤。

修复为先投影 `id`、`canonicalCode`、`market`、`instrumentType`、`active`，再执行原身份约束，不放宽 Schema。已检查 Mobile 标的选择器和 Server 自选仓储：二者原本即投影这五个字段，无需修改。

另确认完整代码 `600036.SH` 的精确候选可能在数据库截取前被模糊结果挤掉。共享目录搜索在 SQL 候选截取和应用层排名两处优先精确代码与市场身份，保留大小写兼容及不同市场的区分。没有变更目录、Asset、自选事实或来源准入。

## 验证

- Desktop：`pnpm --filter @thesis-ledger/desktop exec vitest run test/watchlist.ui.test.tsx test/instrument-symbol-field.ui.test.tsx test/instrument-catalog-search.recovery.ui.test.tsx`，12 测试通过。新增用例使用完整搜索元数据，覆盖结果展示、过滤不支持类型、按目录 ID 提交；修复前无候选，修复后通过。
- Server：`pnpm --filter @thesis-ledger/server exec vitest run test/instrument.service.test.ts test/instrument-directory.service.test.ts`，9 测试通过；覆盖完整代码、大小写及不同市场不混淆。
- Desktop/Server build、相关五个文件 ESLint、边界检查、`git diff --check` 通过。Desktop 保留已有 bundle 大小提示。
- 实际浏览器运行主应用 `/watchlist`，在 1440、1024、768、390 宽度下分别搜索 `600036`、“招商银行”、`600036.SH`，均显示正确 A 股候选；无横向溢出，选中后按正确目录 ID 提交并关闭弹窗。目录搜索使用真实只读接口，自选名单和添加响应被受控拦截，未修改用户自选。
- 真实服务接口额外核验 `600036.sh`：也返回招商银行；完整代码的首项为 `600036.SH`。名称查询保留 A/H 股各自身份。

截图与结果：`/tmp/cmb-picker-qa/`；脚本 `/tmp/check-cmb-search.cjs`；过滤日志及接口摘要 `/tmp/cmb-picker-*`、`/tmp/cmb-directory-*`、`/tmp/cmb-search-runtime-final.json`。人工检查了窄屏搜索弹窗。

## 本地运行态

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，默认参数，退出 0。预检通过，Server 及 Worker 更新，Server/Worker 健康；Desktop 在宿主机构建，并由现行 Vite 服务读取源码。镜像保持 `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`；本次更新仅位于容器可写层，重建会恢复镜像内代码。未变更数据库结构或卷。
