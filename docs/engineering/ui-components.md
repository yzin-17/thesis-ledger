# 桌面端 UI 组件约定

## 组件来源

桌面端 UI 组件通过 shadcn CLI 生成并维护，配置位于 `apps/desktop/components.json`。当前使用 `base-vega` 风格，组件源码落在 `apps/desktop/src/components/ui/`。

shadcn 是组件源码生成与更新工具，不是运行时组件库。生成的组件可以使用 `@base-ui/react` 作为底层无样式原语；这属于 shadcn 组件的实现依赖，不代表项目另行维护一套 Base UI 组件封装。

因此，新增或修复组件时应优先使用 shadcn registry 中的组件结构，避免重新设计同一组件的 Provider、状态管理、Portal、Viewport 或交互生命周期。

## Toast 约定

Toast 使用 shadcn `base-vega` 的 `Toaster` 结构：

- 应用根部渲染 `Toaster`，由它组装 `Toast.Provider`、`Toast.Portal`、`Toast.Viewport` 和 Toast 列表。
- 业务代码通过组件导出的 `toast` 或 `useToastManager` 创建和管理通知。
- 自动关闭、队列、堆叠、滑动关闭和动画由底层 Toast 原语处理，不在业务组件中增加自定义计时器或重复的关闭副作用。
- 项目可以保留中文无障碍文案、语义颜色变量和 `layer-toast` 层级类；这些属于项目主题适配，不改变 shadcn 的组件结构。
- 错误通知如果显式设置 `timeout: 0`，表示需要用户手动关闭或执行操作；这与成功通知的短时展示策略分开处理。

## 更新组件

更新已安装组件前，先在 `apps/desktop` 目录执行：

```bash
pnpm exec shadcn docs <component>
pnpm exec shadcn add <component> --dry-run
pnpm exec shadcn add <component> --diff <component>.tsx
```

先检查 registry 与本地差异，再将必要的主题变量、中文文案和无障碍属性合并回本地源码。不要用手写的平行实现替代 shadcn 组件，也不要在未确认影响范围时直接覆盖其他已安装组件。
