# Desktop 页面代码按需加载

## 问题与目标

实施前 Desktop 入口脚本 2,854,018 字节，gzip 868,124 字节；各路由页面及收益分区采用同步导入，尚未打开的研究、策略、复盘等实现也进入入口。保留应用壳、导航与查询编排，按首次呈现加载页面代码，降低无关实现的初始传输与解析范围。

## 验收标准

- AC1：按稳定 Module 顶层声明延迟页面；未访问页面的加载器不执行，首次访问仅加载一次，props/查询变化与收益页签往返保持原组件身份和交互。
- AC2：应用层的延迟页面 Interface 统一加载和失败呈现；复用现有 LoadingState、Alert、Button。失败时保留应用导航并提供重新加载页面入口，错误不显示业务空状态。
- AC3：主要路由、收益分区和旧路由重定向保持；账户/模式、URL 参数、未保存修改确认、取消、返回与原请求身份不变。收益 URL 投影独立于页面实现，既有类型与导出兼容。
- AC4：实际生产构建测量入口与初始静态依赖闭包，入口及其初始静态依赖 JS 总量至少缩小 30%；记录按需 chunk 和默认收益页实际请求量，不将入口减少等同于所有首屏传输减少，不放宽 chunk 阈值。
- AC5：定向后 Desktop 完整包、构建及仓库门禁通过；在实际生产资源上进行四宽受控浏览器验收，覆盖代表页面跳转/返回、等待、chunk 失败与重新加载、账户/模式及未保存修改保护。真实数据只读，业务 API 使用隔离响应。
- AC6：核对最终依赖方向、稳定输入、证据和文档后归档，继续全线程 Goal。

## Module 与 Interface

延迟页面的 Module 属于 Desktop 应用编排；一个加载器 Interface 隐藏 React.lazy、Suspense 和失败处理的 Implementation。路由与收益工作区使用同一 Seam，各页面导入作为实际 Adapter。稳定顶层声明保留 React 的加载缓存与状态身份，不将应用编排下移到 feature 或 Domain。

收益页签名称及 URL 投影继续由应用导航拥有，单独消费时不加载收益页面实现。共享查询、导航保护和主题位于延迟页面外部；请求缓存及业务生命周期不因代码加载而迁移。按需加载遵循现有 Vite/React 能力，复用现有样式原子类与共享交互模块，不新增依赖。

## 验证与边界

基线为 `/tmp/goal-desktop-startup-bundle-baseline.json` 和基金误差当轮构建；实施期间比较相同源码范围的生产资源。React 官方 lazy/Suspense 合同用于稳定声明、缓存、加载与拒绝处理，项目锁定 shadcn docs/examples 用于现有 Alert/Spinner 组合。

不修改业务数据、Schema、数据库、Worker、Provider、Docker、原生配置或发布；目标运行态与真实来源门禁由原任务保留。实施见[任务](../archive/tasks/2026-11-07-desktop-deferred-pages.md)。

## 验收记录

[本轮证据](../archive/evidence/2026-11-07-desktop-deferred-pages.md)记录原始包体积、默认页面实际请求量和加载失败恢复；后续公共导航调整见[导航规格](2026-11-07-desktop-navigation-density.md)。
