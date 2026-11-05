# S07 目标同步与只读接口验证

## 官方同步

通过 infra 官方入口 `rtk proxy ./scripts/sync-code.sh thesis-ledger` 完成兼容预检、构建、Server/Worker 代码同步及健康检查。日志：`/private/tmp/goal-s07-u03-sync-20260927.log`。两个容器均为 healthy，镜像仍为 `sha256:f51e7f52e3ce141fa29517afae0005ff9c9c19d12009b0a6d8b3f4539ea49b7a`。

本次修改位于容器可写层；重建容器会恢复镜像代码。脚本未变更数据库结构或外部卷，未同步 DSA。官方入口本身不部署 Desktop：Desktop 的构建证据属于宿主机产物，不能记为界面已在目标运行。

比较宿主机构建与 Server/Worker 的四个产物 SHA256，全部一致：联合预检 service、非价格预检、事件诊断及新增请求 schema。首次摘要核对使用了容器不存在的 workspace 包路径；根据 Node 实际模块解析定位 Schemas 后首次重试通过。

## 真实 HTTP 与数据库只读边界

- `/api/v1/health` 返回 200。
- 新路由 `/api/v1/backtests/run-config/preflight` 对非法合同版本返回 400。
- 合法请求引用不存在的策略返回 404。
- 使用目标库已有 V2 策略，故意缺少显式价格绑定，返回 201、`status=invalid-input`、空修订凭据及 `priceInputBindings` 诊断。
- 该检查前后 `BacktestJob` 数量一致。请求在输入规划阶段拒绝，没有进入行情/事件 Provider 读取，也未调用 AI。

探针：`/private/tmp/goal-s07-runtime-preflight-20260927.mjs`；结果：`/private/tmp/goal-s07-runtime-preflight-20260927.log`。输出只含状态和计数一致性，不打印策略内容、账号或凭据。此证据证明部署后的路由、策略读取和确定性拒绝边界，不证明一次有效配置的完整预检或回测成功。

## 浏览器跳过记录

使用 Browser skill 的 Codex 内置浏览器访问已确认监听的 `http://localhost:3000`，初次及两次重试均为 `net::ERR_BLOCKED_BY_CLIENT`。按用户预算停止重试，关闭本轮临时标签页。此地址实际是 Server API，根路径为 404；未到达 Desktop 页面，不计为界面验收。

浏览器/Electron 的 U03 操作、目标真实依赖通过路径、完整 S07/S04/S05 以及 G-UI 仍开放。已有外部数据卡点保持原跳过状态，本轮未重置或消耗其重试预算。
