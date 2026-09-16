# DSA 上游同步工程流程

本文只描述 `daily-stock-analysis` Fork 与 upstream 的同步操作。仓库职责和兼容边界见 [`../architecture/2026-08-18-dsa-upstream.md`](../architecture/2026-08-18-dsa-upstream.md)，发布级版本关系见 [`../architecture/version-matrix.md`](../architecture/version-matrix.md)。

## 同步步骤

在 DSA Fork 仓库内执行：

```bash
git fetch upstream --tags --prune
git status --short --branch
git switch -c sync/upstream-YYYYMMDD
git merge --no-commit --no-ff upstream/main
```

如果出现冲突，先按 Provider/Contract/运行时职责分类处理，不直接选择 ours/theirs 覆盖无法解释的行为变化。

## 合并前门禁

至少完成：

1. DSA 原有测试与受影响 Provider 定向测试；
2. ThesisLedger Data/Control Contract 测试；
3. 固定行情/筹码/目录等与本次 upstream diff 相关的回归；
4. Python 编译/静态检查和 `git diff --check`；
5. 如改变 capability、wire shape、Provider source 或错误语义，同步更新主仓兼容矩阵/Schema，并执行跨仓 payload/black-box 验证。

真实 Provider smoke 只能证明当前网络与账号环境，不替代确定性 Contract 测试；fixture 也不能替代需要真实 Provider 的门禁。

## 版本记录

不要在本流程文档写死当前 upstream commit 或 Fork tag。每次同步/发布在 PR、release 或兼容矩阵中记录：

- DSA Fork commit；
- upstream commit/tag；
- Data/Control Contract major；
- 可发布镜像 digest；
- 受影响 capability 与已执行验证。

生产/稳定部署优先使用 immutable digest；tag 只承担发布说明和人类可读版本标识。
