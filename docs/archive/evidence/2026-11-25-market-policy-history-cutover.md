# 行情路由历史修订转换验收

2026-11-25 17:55（上海时间）核验本地 `thesis-ledger-dev/thesis_ledger`。处理对象为 PostgreSQL 中含退役聚合状态路由的 198 条历史修订。

- 171 条完整转换，保留修订编号、已有独立选源、适用来源顺序和启停状态。修订 123、125 的 TickFlow 免费历史目标迁入当前统一目标，实际仍使用同一个免费历史读取器。
- 27 条无法完整转换，从产品回滚历史删除，范围为修订 167–193。每条均包含已退役的 NVIDIA 新闻来源，其中部分还包含已取消的东财研报 EPS 或行业排名。私有预览 `plan.json` 保存了全部 198 条原始记录、转换结果和逐条原因。

## 执行

在 `thesis-ledger-infra` 运行以下已登记的维护命令，依次将 `<阶段>` 替换为 `preview`、`rehearse`、`apply`，三阶段退出码均为 0。

```sh
node scripts/infra.mjs locked -- node ../thesis-ledger/scripts/local-runtime/migrate-market-policy-history.mjs <阶段> \
  --directory /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/market-policy-history-v1-20261125 \
  --confirm thesis-ledger-dev/thesis_ledger
```

备份文件权限为 `0600`，SHA-256 为 `cd6cfb3a1205603a5fe6527b40e388111e1666b399350b71f582576d96e3e0bf`。事务演练后独立读回 203 条修订，198 条待处理记录仍在。正式提交前比对实时清单和预览。

## 独立核对

- 四项定向测试通过，覆盖精确能力映射与优先级、显式停用、已确认的来源合并、无法映射的整版处理。初次启动测试发现导入的辅助函数不在公开导出中，改为复用已导出的独立能力清单后通过。
- 提交后 PostgreSQL 共有 176 条修订。逐行读回 171 条转换配置及其其他原始字段，27 条清除对象均已移除，可回滚路由中旧状态能力为零。171 条使用已部署 Server 的回滚解码及精确能力目录校验全部通过，目录修订为 `3791690940717343`。
- 生效策略以整行对账与操作前一致，修订为 203，状态为 `applied`。DSA SQLite 的 1 条生效记录与 202 条已应用历史的逐行摘要一致，原缓存代次依据得到保留。回滚验收使用只读的解码和目录校验。
