# 行情详情诊断与双轴图验收证据

> 日期：2026-11-04（北京时间）
> 规格：[当前合同](../../specs/2026-11-04-market-detail-pnl-diagnostics.md)
> 实施记录：[已归档任务](../../archive/tasks/2026-11-04-market-detail-pnl-diagnostics.md)

## 确定性验证

| 范围 | 命令或入口 | 结果与断言 |
| --- | --- | --- |
| DSA 历史日期 | `python -m pytest tests/test_thesis_ledger_nav_dates.py tests/test_thesis_ledger_fund_nav_history_capability_path.py -q -p no:cacheprovider` | 28 项通过；旧日期历史点为正常延迟值，保留 UTC 日期顺序与来源切换语义 |
| DSA 语法 | `python3 -m py_compile api/thesis_ledger.py tests/test_thesis_ledger_nav_dates.py` | 通过；字节码写入临时缓存目录 |
| 缓存原因 | Server 的 `current-cache-control.test.ts`、`market-stale-reason.test.ts` | 21 项通过；超时、限流、格式、权限与未知原因，原始来源地址及异常不泄露 |
| 标的历史与 Ledger | Server 的 `performance-instrument-pnl.test.ts`、`performance-pnl-series.test.ts`、`ledger/trade-realized-pnl-history.test.ts` | 15 项通过；完整市场代码、账户/模式/截止时间、重复持仓、清仓、冻结汇率和空点 |
| 公共合同 | Schema、API 客户端的 `performance-pnl.test.ts` | 各 2 项通过；拒绝裸代码、错范围及错截止时点，传递取消信号，组合旧请求兼容 |
| 详情原因 | `MarketDetailDialog.test.tsx`、`MarketDetailDialog.latest.integration.test.tsx`、`market-detail-stale-reason.test.ts` | 21 项通过；保留刷新中、重试、上游窗口及普通延迟净值语义 |
| 同图交互 | `MarketNavChart.test.tsx`、`FundNavPnlChart.test.tsx`、`fund-nav-pnl-series.test.ts` | 9 项通过；同一图表、左右轴、零基线、缺口断线、上海日期对齐、同日去重及不同日期读数不互借 |
| 组合回归 | `performance-pnl-model.test.ts`、`portfolio-pnl-chart.ui.test.tsx`、`portfolio-account-filter.ui.test.tsx` | 12 项通过；既有组合走势图与账户筛选保持 |
| 构建前置类型 | `ai-generation-schema-prompt.test.ts`、`ai-research-reasoning.test.ts`、`ai-research-policy.test.ts` | 14 项通过；仅两处类型表达修正，不改变 AI 请求行为 |

主仓测试使用各包的 `pnpm exec vitest run`。DSA 原 `.venv` 的解释器软链接已失效；在 `/tmp/thesis-ledger-market-detail-python` 使用临时 Python 3.12.16 并复用既有 site-packages 完成离线测试，没有改写 `.venv` 或安装项目依赖。

`schemas`、`api-client`、Server 和 Desktop 构建通过。任务相关 ESLint 与 `scripts/check-boundaries.mjs` 通过。尺寸检查返回 0，有七项存量文件警告；本次新增文件及修改的页面/服务均未超过对应阈值。`git diff --check` 通过。

## 本地运行态

在相邻 `thesis-ledger-infra` 根目录依次执行：

1. `bash ./scripts/sync-code.sh all`：退出 0，DSA、Server、Worker 健康；用于本次三层代码更新。
2. `bash ./scripts/sync-code.sh thesis-ledger`：退出 0，Server、Worker 健康；应用最终图表实现，DSA 输入未变，不重复更新 DSA。

两次维护脚本的兼容性预检均通过，镜像编号保持不变，没有数据库结构、卷或 Provider 配置变更。快更只修改容器可写层，不能作为新镜像、安装包或正式发布证据。完整临时输出为 `/tmp/market-detail-sync-all.log` 与 `/tmp/market-detail-sync-final.log`。

## 真实浏览器结果

使用构建后的 Vite preview（`127.0.0.1:4173`）连接已更新的真实本地 API，并检查 1440、768、390 三种宽度。截图与机器记录位于 `/tmp/market-detail-browser-production/`，临时 preview 在验证后停止。

- 实际打开 `华夏成长混合 · 000001.OF` 的基金账户持仓详情，只有一个净值图表容器；图内左轴为累计盈亏金额，右轴为单位净值。
- 真实标的盈亏请求返回 HTTP 200。当前已实现收益为零，累计盈亏为 `-29.45 CNY`，与同账户持仓未实现盈亏一致；净值 `0.895` 对应 11 月 3 日，当前盈亏点对应 11 月 4 日，分别标注日期。
- 历史净值分段显示“可用”，没有历史日期造成的陈旧横幅。真实来源请求失败的安全原因展示由确定性测试覆盖，本次不通过注入故障影响 Provider。
- 八个历史盈亏时点缺行情，保留空点；当前仅一个有效盈亏点，图中显示单点及解释，未用当前持仓回推旧收益。
- 共享区间切换可用；手机弹窗宽 358px、视口宽 390px，无横向溢出。页面运行异常记录为空。

## 最终核对

AC1—AC5 在本次声明的本地 Web/API 范围通过。没有远程 CI、生产发布、Electron 安装包或原生客户端验收声明。历史数据缺口属于实际输入限制，已正确展示；没有改写历史快照、补造收益、清理业务数据或调整来源配置。未提交、推送或发布。
