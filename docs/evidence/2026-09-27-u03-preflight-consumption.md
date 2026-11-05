# U03 普通回测联合预检消费

## 实施结果

普通复权回测沿用“准备并核对配置”按钮。既有 TanStack Query 请求链先准备配置，再携带服务端返回的完整 RunConfig 调用联合预检；两步通过且修订戳一致后才向父表单发布可提交配置。联合预检阻断时转换为不含 RunConfig 的阻断状态；请求标识错配、修订变化或传输失败均不会保留成功状态。

两次请求共享取消信号。准备返回前已取消时不发起预检；预检期间修改表单或关闭组件会取消请求并隔离晚到结果。保留原查询键和路由缓存失效机制，并修正时间判断：比准备戳更高的 Desired、Effective 或 Catalog 修订立即使准备结果失效，即使本地修订更新早于整个请求链完成时间，也不能当作旧缓存忽略。较低修订的历史缓存仍按原规则处理。

诊断组件复用既有 Alert，显示标的、中文能力名称、检查区间、已知实际请求来源及建议。成功文案区分预检通过与回测完成。未修改旧 raw 回测路径或 AI 实验合同；没有自动创建 Run 或调用模型。

## 验证与限制

- 原准备、联合请求链和实验准备共享失效逻辑组合 **21 项通过**：`/private/tmp/goal-u03-preflight-final-20260927.log`。
- 随后补充“准备返回前取消不发第二次请求”，请求链文件 **8 项通过**：`/private/tmp/goal-u03-preflight-cancel-20260927.log`。两批有重叠，不相加作为独立总数。
- Desktop 类型检查、相关源码及测试 ESLint、生产构建通过。构建仍有大于 500 kB 的分块提示，未放宽门禁。日志前缀 `/private/tmp/goal-u03-preflight-`，后缀为 `types`、`lint`、`build`。
- 核对项目锁定 shadcn 的 `info --json`、已有 Base UI 组件以及 [Button 文档](https://ui.shadcn.com/docs/components/base/button)、[Alert 文档](https://ui.shadcn.com/docs/components/base/alert)。复用本地组件，未新增 CSS 或安装组件。

本轮为未提交工作区的请求行为、竞态和静态渲染证据，不是浏览器/Electron 交互验收。目标服务和前端未部署，U03 与 S07 父项继续保留目标运行态门禁；旧外部卡点预算不重置。
