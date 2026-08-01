# DSA Fork Delta Audit

## 审计基线

- 官方 upstream：`https://github.com/ZhuLinsen/daily_stock_analysis.git`
- 自有 Fork：`https://github.com/yzin-17/daily_stock_analysis`
- 对比提交：`831ada5370123551e5cb4fc099208dd70e892e22`
- 审计日期：2026-08-01

## 差异分类

在 `third_party/daily_stock_analysis` 执行：

```text
git fetch upstream --tags --prune
git diff --name-status upstream/main...origin/main
git diff --stat upstream/main...origin/main
```

结果为空；`origin/main` 与 `upstream/main` 均指向上述提交，当前 Fork 没有本地 patch，也没有把 Investment OS Adapter 代码混入 DSA Fork。因此分类结果为：

| 分类           | 文件数 | 原因与测试                                                         |
| -------------- | -----: | ------------------------------------------------------------------ |
| upstream 原样  |   全部 | 上游代码原样保留；以 DSA 自带测试和固定镜像健康/行情审计为基线     |
| 本地 patch     |      0 | 无需要维护的 Fork patch                                            |
| 本地 extension |      0 | 扩展放在主仓 `services/dsa-adapter`、Contract 和 docs，不改写 Fork |

零差异不是遗漏：Investment OS 的事实源、Adapter、AI Tool 薄适配和归一化 Contract 都属于主仓职责，避免在 Fork 中形成第二套业务领域。

## 维护成本结论

当前只需维护 Fork 指针、镜像版本和主仓 Contract；一旦未来产生 patch，必须在此表新增文件级原因、测试和回收计划。同步前后均需重新运行 DSA 原有测试、主仓 Adapter Contract Test、Market/Chip 固定 fixture 和镜像启动检查。

## 验证结果

```text
origin/main   = 831ada5370123551e5cb4fc099208dd70e892e22
upstream/main = 831ada5370123551e5cb4fc099208dd70e892e22
git diff --stat upstream/main...origin/main  # 空
git diff --check                              # 通过
```
