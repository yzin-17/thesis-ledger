# 负现金导致配置读取失败验收记录

## 根因与修复

用户确认问题页面为本机 `localhost:5173`。直连代理读取到完整估值：证券 176.76 元、现金 −82 元，目标为未设置。按前端原投影发送 `POST /api/v1/performance/allocation` 返回 400，“资产市值不能为负数”。直接 HTTP 诊断必须禁用宿主代理；初次经系统代理出现的 502 已排除，不能作为服务离线证据。

按[规格](../../specs/2026-11-05-negative-cash-allocation.md)，Performance 先规范化类别，只对现金允许有限负余额；领域再平衡采用同一约束。证券负市值、非有限金额、非正净资产、不完整估值和目标合计校验保留。证券／现金的原金额、净资产分母、权重、取分和差额守恒公式没有变化。

[实施任务](../tasks/2026-11-05-negative-cash-allocation.md)维护当前验收状态。

## 本地验证

- `packages/domain`：`pnpm exec vitest run test/performance.test.ts --reporter=dot`，9 项通过；随后领域包全量 52 文件 474 项通过。
- `apps/server`：`pnpm exec vitest run test/performance-correctness.test.ts test/performance/services.test.ts --reporter=dot`，2 文件 37 项通过。覆盖真实复现金额、现金别名、非现金负市值拒绝、无目标、存在目标、零／负净资产和 partial。
- `apps/desktop`：使用 `NODE_OPTIONS=--no-experimental-webstorage` 运行 `performance-ui`、`performance-read-state`、`performance-workspace`、`performance-target-save`，4 文件 39 项通过。新增 API 响应投影与真实组件回归验证现金 −82 元、基金 186.53%、现金 −86.53% 可读且目标入口保留。
- 领域和 Server 构建、所改源码／测试 ESLint、模块边界通过。生产代码相对修改前副本仅调整两处现金校验；副本位于 `/tmp/thesis-ledger-allocation-failure-20261105/before/`。

最初从根目录运行领域测试时触发多项目重复收集；领域自身 9 项通过，其他项目导入失败。改在所属领域目录执行后通过，不将根目录错误运行记为全仓验证。

## 本地运行态

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行维护入口 `./scripts/sync-code.sh thesis-ledger`，使用已安装 Node 26.13.0 与 npmmirror 配置。兼容性预检通过，退出码 0；同步并重启 `thesis-ledger`、`backtest-worker`，两者健康，镜像 ID 保持不变。脚本未执行数据库结构或卷变更；更新位于容器可写层，不作为新镜像发布证据。

独立直连本机 5173 复核：

- 冻结的原失败请求由 HTTP 400 恢复为 HTTP 201，基金与现金原值保留，权重按净资产 94.76 元计算。
- 仅在只读配置计算请求中传入基金目标 100%，返回基金 −82 元、现金 +82 元的再平衡差额，合计为零；没有保存目标。
- 负基金市值仍返回 HTTP 400；随后读取已存目标仍为空。

## 浏览器与最终一致性复核

通过 taste skill 的 `shoot.mjs`，使用独立无界面 Edge 打开真实 `http://localhost:5173/performance?tab=allocation`。首轮短等待截图出现账户范围读取失败，未计为通过；后端稳定后延长等待复测，同一真实页面已显示基金 176.76 元／186.53%、现金 −82 元／−86.53%，设置目标按钮保留，配置读取失败提示消失。截图已人工复核，未使用固定数据替代运行态。

全部 AC 已核对：原负现金保留、领域与 HTTP 校验一致、再平衡公式与非正净资产／partial 限制保留，Desktop 投影及真实页面可读。任务范围内无剩余事项。未更改交易、现金、目标配置或数据库结构；未提交、推送或发布新镜像。

日志、冻结的复现输入和实际响应位于 `/tmp/thesis-ledger-allocation-failure-20261105/`；截图、必要日志和源码指纹保存在 `/Users/yzin/.codex/visualizations/2026/11/05/01a1aa9f-a6f8-7631-95a5-5d400a1dc132/negative-cash-allocation/`，不将临时输入或完整用户数据加入 Git。
