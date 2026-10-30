# 文件尺寸门禁源码归属验收记录

## 修复范围与保护

目录适配任务的尺寸门禁出现三项违规：真实 Provider UI 测试为 887 行，HEAD 基线为 865 行；两个现有移动端验收包内的同名副本也被递归扫描为新增源码。

尺寸门禁现在复用仓库已有的 Git 候选清单，再筛选现存文件。原目录缓存排除、800／600／800 行阈值及 ratchet 比较规则保持；没有增加 ignore，已跟踪的 ignore 路径仍会检查。未跟踪的验收包保留原位。

Provider 测试按已有两个职责组拆分：请求与密钥边界 14 项、页面操作 16 项，公共记录夹具独立保存。全部 30 个原测试的语法树及原夹具均反读一致；两个被误扫的快照测试文件哈希保持。

## 验证

- `node --test scripts/file-size-sources.test.mjs scripts/workspace-lint-sources.test.mjs`：10 项通过，覆盖未提交源码、中文路径、已跟踪 ignore 文件、目录与删除文件、Git 不可用及路径越界。
- Desktop 拆分测试与目录回归：4 个文件、38 项通过；其中原 30 项全部保留，另 8 项为原有目录刷新与模型选择测试。
- Desktop TypeScript 检查通过。
- `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs`：通过，保留 7 条未增长的存量告警。
- 脚本由 Node 语法检查及上述真实清单场景验证；项目 ESLint 配置排除 `.mjs`，未为此修改配置。

## 证据

- [原始测试及快照核对](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/size-final-proof.json)
- [清单测试](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/size-source-tests-final.log)
- [Desktop 测试](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/desktop-split-tests.log)
- [Desktop 类型检查](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/desktop-typecheck.log)
- [尺寸门禁](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/file-size-final.log)

本修复不改动产品组件、Provider 配置、业务数据或模型调用预算；未 stage 或 commit。Cloudflare 的实际更新和浏览器结果由其原任务继续验收。
