# 2026-08-26 文档治理跟进

## 背景

本次跟进针对 `main/docs` 在 2026-08-23 至 2026-08-25 新增功能文档后的治理漂移进行修复，不修改业务实现或跨仓接口。

依据：[`DOCUMENTATION-GUIDE.md`](../DOCUMENTATION-GUIDE.md) 与 [`2026-08 文档审查记录`](2026-08-doc-review.md)。

## 发现与处理

| 发现 | 处理 |
| --- | --- |
| `docs/README.md` 引用不存在的 `2026-08-25-unified-backtest-system-v2.md` | 删除失效入口，改为指向当前真实存在的 Strategy、Journal、AI、Performance、Risk 等 Spec |
| `docs/tasks/README.md` 未包含 2026-08-23 至 2026-08-25 新增当前任务 | 重建当前任务索引，区分“仍在实施”与“实现完成、运行时验收待补” |
| `docs/superpowers/specs/` 形成第二套 Spec 路径 | 将收益分析交互 Spec 移到标准 `docs/specs/`，消除体系外 Spec 目录 |
| Snapshot 自动化只有 Task，没有对应 Spec | 新增 `docs/specs/2026-08-24-performance-snapshot-automation.md`，Task 收敛为实施拆分和验证记录 |
| AI Research 已勾选实现任务，但真实 Provider 等运行时 smoke 未执行，完成状态表达冲突 | 将实现完成与运行时验收拆开；保留 T1-T10 实现完成状态，新增独立 Runtime Acceptance Pending 门禁和未完成清单 |
| 多份已完成实现任务仍位于 `docs/tasks/` | 暂不强制归档；只要仍有浏览器、设备、真实 Provider、真实 Worker、生产数据或在线服务门禁，就继续保留在当前任务目录，并在索引中明确状态 |

## 当前治理结论

- `docs/README.md` 继续作为主仓文档唯一导航入口，不再引用不存在的当前 Spec。
- 正式产品/功能规格统一位于 `docs/specs/`；不保留 `docs/superpowers/specs/` 这类第二套 Spec 根路径。
- `docs/tasks/README.md` 必须覆盖当前目录中的有效任务，并明确任务属于“实施中”还是“实现完成但验收待补”。
- 实现完成不等于运行时验收完成。真实 Provider、浏览器、设备、Worker、生产数据和外部服务证据必须单独记录，不能由单元测试或 fixture 代替。
- 有未完成运行时门禁的任务继续保留在 `docs/tasks/`；全部门禁完成后再进行归档判断。

## 后续检查项

后续文档 Review 应额外检查：

- `docs/README.md` 与各目录 README 的相对链接是否全部存在；
- `docs/tasks/` 中的当前任务是否都能从 `tasks/README.md` 找到；
- 新主题是否同时存在对应 Spec 与 Task；
- `docs/` 根目录是否出现未在 `DOCUMENTATION-GUIDE.md` 定义的新增分类；
- 已勾选实现任务是否仍把真实环境 smoke 写成必需但未完成的同级验证条件；
- Runtime Acceptance Pending 任务是否在门禁完成后及时归档。

## 状态

- [x] 修复当前导航死链。
- [x] 同步当前任务索引。
- [x] 收拢非标准 Spec 路径。
- [x] 补齐 Snapshot 自动化 Spec/Task 对。
- [x] 修正 AI Research 实现状态与运行时验收表达。
- [x] 保留仍有真实运行时门禁的任务，不做无证据归档。
