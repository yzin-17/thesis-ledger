# V1 可访问性与响应式 Review

## 已完成的代码级检查

- Desktop 主导航保留可读标签、当前页语义和键盘 focus-visible 轮廓。
- 表单输入、按钮和统一状态提示保留可操作/可读的语义属性。
- Desktop 提供 800px、520px 两级响应式布局；底部小屏导航不遮挡主要内容。
- Loading 骨架支持 `prefers-reduced-motion: reduce`。
- Mobile 数据层定义 loading、ready、empty、error、stale 五类状态，并由契约测试覆盖。
- `pnpm accessibility:check` 对上述约束执行静态检查。
- 同一静态门禁额外计算 Desktop 主要辅助文字与面板背景的 WCAG AA 对比度，纳入 `#7e8983/#8c9691/#b6beb9` 对 `#171b1a` 的 4.5:1 阈值检查。
- 开发服务浏览器已验证首个导航按钮的 `focus-visible` 轮廓（2px）以及 800px/520px 视口下主导航和 Portfolio 内容仍可见；这不是 macOS release 包的两种窗口宽度证据。

## 尚待人工验收

- [x] Desktop release 包在键盘-only 流程完成账户、导入、风险和研究操作（D2/D3/D4/D6/D7 路径已实测并归档）。
- [x] Desktop 在 800px、520px 环境逐页检查（已有 release 截图）；本版本明确不纳入高对比度模式优化。
- [x] Android API 35 模拟器已完成 1080×2400 与 600×1000 小屏检查，覆盖 Tab、状态提示、指标卡、错误重试、stale 提示和滚动持仓；iOS 及 release 包仍待目标环境复核。
- [x] 真实浏览器/设备截图与问题清单归档（macOS release、Android API 35 和 iOS Simulator 证据已归档）。

代码级检查不是完整视觉或设备验收；本轮已完成 T278 所需的 Desktop 键盘/焦点、800px/520px 窗口和 Android 小屏证据。高对比度模式不属于本版本验收范围。
