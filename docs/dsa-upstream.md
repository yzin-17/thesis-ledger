# DSA Fork 与上游同步

## 当前审计基线

- 上游：`https://github.com/ZhuLinsen/daily_stock_analysis.git`
- 自有 Fork：`https://github.com/yzin-17/daily_stock_analysis`
- 审计提交：`831ada5370123551e5cb4fc099208dd70e892e22`
- 获取日期：2026-08-01

已创建用户 Fork，并在本地 `third_party/daily_stock_analysis` 建立工作副本；该目录被根仓库忽略，避免把上游完整历史复制进主仓。工作副本的 `origin` 指向用户 Fork，`upstream` 指向官方仓库，二者 `main` 均为审计提交 `831ada5370123551e5cb4fc099208dd70e892e22`。主仓的 `services/dsa-adapter` 和 `infra/docker/dsa_stub.py` 仍只负责 Investment OS Contract；正式 DSA 代码在 Fork 中独立维护。

首次同步验证（2026-08-01）：

```text
git -C third_party/daily_stock_analysis fetch upstream --tags --prune
origin/main   = 831ada5370123551e5cb4fc099208dd70e892e22
upstream/main = 831ada5370123551e5cb4fc099208dd70e892e22
git merge-tree --write-tree main upstream/main
7935178970a3ecc74b7137f2866bcf5ec58de827
git merge --no-commit --no-ff upstream/main
Already up to date.
```

上述 dry-run 没有产生冲突，也没有修改工作树。

镜像验证（2026-08-01）：

- 构建标签：`investment-os-dsa:831ada537012`
- 镜像 digest：`sha256:33fdeaf23e59b8cd90830d16853a6b17badb5e8eca7f26dea46fef9a232d7cf1`
- 镜像 label：`org.openai.investment-os.dsa.commit=831ada5370123551e5cb4fc099208dd70e892e22`
- 隔离容器 `GET /api/health` 返回 `status=ok`；`GET /api/v1/stocks/600519/quote` 返回行情结构和实时价格字段。

## 正式 Fork 约定

自有 Fork 创建后，`origin` 指向自有仓库，`upstream` 指向上述官方仓库。当前 `origin/main` 与 `upstream/main` 零差异，逐项结果见 `docs/reviews/dsa-fork-delta-audit.md`。扩展优先放入 `investment_os/`、`adapters/` 或 `extensions/`，避免无业务价值的目录重排；Investment OS 的事实源与 Adapter 不回写到 Fork。每月或安全修复发布后同步一次：

1. `git fetch upstream --tags --prune`
2. 从已发布分支建立临时同步分支。
3. 合并 `upstream/main`，不在主分支直接 rebase。
4. 运行 DSA 原有测试、Investment OS Contract Test 和固定筹码/行情回归。
5. 构建带上游提交和本地提交标签的 `investment-os-dsa:<version>`。

同步冲突处理：先保留临时同步分支和上游提交，按文件分类确认是否属于 DSA 原样、必要 patch 或主仓 extension；禁止直接覆盖主仓事实源/Contract。解决冲突后依次执行 `git diff --check`、DSA 原有测试、主仓 Adapter Contract Test、固定行情/筹码 fixture，再重建带 commit label 的镜像。任何无法解释的行为变化先停止合并并由 DSA/Adapter owner 复核。

首次 Fork、upstream dry-run 和镜像构建证据已经补录；T009 与 T010 已完成。镜像尚未配置签名发布链，生产签名仍属于 V1 Release Checklist 的发布门禁，不影响本地 Fork/镜像审计结论。
