# 回测任务列表恢复验收

对应 [Spec](../specs/2026-11-07-backtest-group-source.md)、[Task](../tasks/2026-11-07-backtest-group-source.md)。保留共享工作区既有修改，未提交 Git。

## 根因及修复

实际 GET `/api/v1/strategy-optimization/backtests/groups?limit=30` 返回 HTTP 200，但第一页第 10 条记录的 `source.kind=existing`、`source.version=0`。它是未关联实验 runRefs 的内部 AI 探索种子，不符合正式策略来源的正版本契约，客户端拒绝整页。实际浏览器复现相同失败；原始响应保留在 `/tmp/backtest-groups-response.json`。

Server 未关联任务分支现在仅把正整数版本与 Schema 版本投影为 existing，其他已知记录使用现有 unknown/missing_source 并保留来源引用。缺失记录仍沿用 null。保留任务及排序分页，不删除记录、不修改历史版本、不推测实验关联、不放宽客户端契约。未知来源标题保留已有名称，避免渲染为正式 v0。

实际 UI 验收还发现筛选栏 768px 三列撑宽整页，`StrategyBacktestJobsPage.tsx` 局部调整为 lg 三列，搜索和策略列可收缩，窄屏堆叠；共享 Select、Field、表格及业务接口不变。使用项目锁定 shadcn CLI 阅读 Field、Select 文档及现有组件；无需新增 CSS 或组件。

## 测试与门禁

- Server 定向测试：`pnpm --filter @thesis-ledger/server exec vitest run test/strategy-optimization/strategy-optimization-read.test.ts test/strategy-optimization/strategy-backtest-groups-identity.test.ts`，11 项通过。覆盖正式版本 4、种子 0、负版本、无效 Schema 版本，序列化结果通过真实页面响应 Schema；保留任务计数与现有 legacy 过滤。
- Server 全包：498 文件通过、89 跳过；3933 测试通过、399 跳过。日志 `/tmp/backtest-source-server-tests-network.log`。首次默认沙箱运行有 34 文件失败（本地 HTTP listen EPERM），允许监听后全包重跑通过；首次失败记录 `/tmp/backtest-source-server-tests.log` 保留，不作为代码通过证据。未启用的 PostgreSQL/外部集成测试仍是跳过，不宣称通过。
- Server `build` 与本次修改文件的 ESLint 通过。日志 `/tmp/backtest-source-server-build.log`、`/tmp/backtest-source-lint.log`。
- Desktop 定向 23 项通过，build、相关文件 ESLint 通过。日志 `/tmp/backtest-source-desktop-target.log`、`/tmp/backtest-source-desktop-build.log`、`/tmp/backtest-source-desktop-lint.log`。原样式字符串断言同步新布局；保留原失败记录说明，不增加镜像构建。前端仍有既有大 chunk 警告。
- 边界、workspace 依赖门禁及 diff 空白检查通过；文件尺寸门禁存在 6 个既有大文件警告，无 ratchet baseline，不能扩大为全仓技术债已解决。修改后的 Server service 578 行，低于 600 阈值。

## 当前运行态

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，无额外环境参数；兼容性预检通过，退出 0。目标 Server 与 Backtest Worker 已同步并健康，镜像 ID 未变，数据库及卷未变。日志 `/tmp/backtest-source-sync.log`。这是容器可写层快更，重建后会恢复镜像代码，不代表生产镜像发布。

独立只读请求验证全部三页：30 + 30 + 21 = 81，81 个唯一分组，修复前后总数一致。修复前仅第一页契约失败；修复后三页全部通过，原种子任务仍在第一页且 source=unknown/missing_source。结果 `/tmp/backtest-source-before.json`、`/tmp/backtest-source-after.json`，运行器 `/tmp/backtest-source-pages.mjs`。

实际 Vite 页面 `/strategy/jobs` 恢复显示，上一页/下一页通过；1440、1024、768、390 均无整页横向溢出，表格保留内部横向滚动。浏览器禁止全部非 GET API 请求，未创建/运行回测，未改真实账户数据。截图 `/tmp/backtest-source-{1440,1024,768,390}.png`，已目视检查 768px。完整浏览器记录 `/tmp/backtest-source-browser.json`。

最终浏览器复验：长策略名选中后 1440/1024/768/390 均无整页横向溢出；390px 可重新打开策略下拉并选择全部策略；原种子任务详情正常读取且显示来源信息未记录。结果中 `filter=true`、`seedDetail=true`、`errors=[]`、`realWrites=0`。策略弹层仅在本页使用 `alignItemWithTrigger=false`，避免长名称窄屏下选项越界；其余消费者和共享组件未改。

浏览器测量等待 Select 的关闭动画及隐藏状态；Base UI 保留关闭节点，不能以节点卸载作为等待条件。未等待关闭便快速连续缩放时曾测到瞬态弹层边界，最终脚本已经按实际生命周期等待后复验通过。
