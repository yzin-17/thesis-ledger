# 现行 Run 读取与操作入口门禁

> 日期：2026-09-29；对应 C02-c/d 的局部实施。旧 `jobs` 路由及 Worker 旧模式分派尚未清理。

## 变更

- `/backtests/runs/:id` 的读取、执行、重试、取消在进入实际服务动作前核对持久化 `mode='V3'`，并要求输入同时具有 `contractVersion=3` 与 `schemaVersion='3'`。旧记录或缺损合同返回稳定的 `UNSUPPORTED_CONTRACT_VERSION`；不存在的记录返回 `NotFound`。
- 被拒绝的旧记录不会触发队列取消、Runner、重试或结果授权查询。当前记录继续经过原有结果读取授权边界。
- 仅收紧 `runs` 控制器路径。Desktop 仍使用 `/backtests/jobs`，该路径会在消费面迁移后删除；当前门禁不作为全部旧记录不可达的证据。

## 验证

- 定向 `current-run-boundary.test.ts` 8 项通过，覆盖四条旧记录操作路径、三种缺损版本与当前结果授权；`backtest-configured-run.test.ts` 9 项通过，幂等 fixture 已明确当前双版本字段；`model-disclosure.test.ts` 4 项通过。
- Server typecheck、build 通过；包级测试 233 文件、1830 项通过，25 文件、91 项跳过。改动文件 Prettier 与 `git diff --check` 通过；目标 HTTP 尚未执行。

## 待办

- 队列领取/恢复与 `BacktestV2RunService` 仍接受旧模式，`jobs` 路由仍提供旧数据读取及创建。须迁移 Desktop 和其他消费者后移除，不能将本叶标为 C02 完成。
- 目标容器未运行，本轮未部署；真实 HTTP、权限与用户界面尚未验证。
