# 收费资料检查操作一致性验收记录

## 范围

Desktop 自动化列表统一启停、编辑与立即运行操作。配置和执行复用现有 Market 契约，保留监测调度与历史。真实业务配置只读；受控请求验证写入与恢复。

## 实现与定向验证

- `AutomationTable` 所有系统任务复用同一组操作控件，监测行具有启用/停用、编辑及立即运行；系统任务不显示删除。未知启停或来源不可读时禁用写入，编辑允许重新读取。
- `AutomationSettingsPanel`、`useRuleMonitorAutomation` 和 `RuleMonitorAutomationEditor` 拥有监测管理职责。编辑复用已有来源与开关组件、共享 Sheet 和草稿关闭保护；配置更新使用所见修订，冲突时保留草稿。切换任务及原有任务操作继续沿用既有处理器。
- 立即运行先读取已保存来源；没有来源时打开编辑，已排队/运行时不再提交。响应未确认后重试沿用同一请求标识；同事件周期重复点击只提交一次。成功配置/执行更新使统一任务与历史缓存失效，活动检查沿用原查询轮询。
- Desktop 相关测试共36项通过：新增操作6项、版本面板7项、统一投影2项、原有操作错误提示1项、运行/删除1项、任务界面19项。命令在 `apps/desktop` 执行：`pnpm exec vitest run test/rule-monitor-automation-actions.test.tsx test/rule-monitor-automation-ui.test.tsx src/features/market-data/RuleSourceMonitorPanel.test.tsx test/providers-automation-error-toast.test.tsx test/providers-automation-run-delete.test.tsx test/providers-automation-ui.test.tsx`。最终输入分批复用：其余5文件30项已通过，新操作文件修正夹具读取后6项通过。
- 新测试最初采用跨包夹具导入，触发包导出与 Vite URL 转换错误；改为项目现有的 `readFileSync`、`dirname(fileURLToPath(import.meta.url))` 读取方式后通过。未修改包导出或关闭 import 门禁。
- `pnpm build` 通过，包含 Desktop 类型检查和 Vite 生产构建。保留既有产物体积和宿主 localStorage 警告，没有调整构建警告阈值。
- 8个本次核心/测试文件以复杂度20、函数220行、禁止嵌套三元的严格 lint 通过；父设置组件使用既有 lint 通过，新增职责由独立组件承接，存量大函数阈值债务保留。依赖边界和文件尺寸门禁通过，尺寸有6项既有警告；`git diff --check` 通过。此前全仓 lint 的无关存量错误未据此计为通过。

## 四宽度实际浏览器

- 新脚本 `apps/desktop/scripts/check-rule-monitor-controls.cjs` 使用已安装 Playwright 和 Edge，覆盖1440、1024、768、390。受控配置/执行响应每宽6次写请求全部拦截，真实写入为0。
- 验证原位编辑边界、配置冲突保留勾选、取消后继续编辑/放弃、重新打开恢复已保存配置、保存关闭、启用/停用、立即运行结果未确认后幂等重试、排队禁用重复运行、无来源打开编辑、读取失败与恢复，以及关闭后焦点返回入口。四组全部通过。
- 真实页面同四宽度只读打开，确认监测行具有与其他系统任务相同的三个操作，真实已保存来源可编辑读取，取消不写入。桌面与窄屏截图已人工核对，编辑内容在面板内滚动，操作区保持可见，无页面横向溢出。截图位于 `/tmp/rule-monitor-controls-qa/`，不进入 Git。
- 既有 `check-rule-monitor-automation.cjs` 按当前入口更新后，四宽度全部通过：真实版本侧边详情、焦点返回、统一历史按任务筛选、部分失败及远端缺口提示保持。真实写请求为0。
- 早期新脚本在第二次提交刚显示“运行中”时过早断言请求次数，修正为等待“已提交”确认后通过；没有为测试修改业务行为。

## 运行态与数据保护

- 用户当前真实配置为修订2、启用、来源 `official-rules/cn-stock-auction-fees`。本轮不会恢复成此前的关闭配置。
- 正式入口：在 `thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，仅同步 Server/Worker 代码，退出码0、两服务健康，镜像保持 `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`。该脚本不装配 Desktop 页面；页面证据来自宿主 Vite 实际开发运行态，Desktop 生产构建另行通过。未计镜像发布或安装包交付。
- 同步后只读配置仍为修订2、启用、同一个来源；最近检查仍为 `580aee12-245e-4339-9b46-5e5ca280228c`、部分失败，32条观察、31个版本，均与本轮基线相同。
- 宿主 Python 默认代理最初导致本地直连 API 返回空502；禁用本地请求代理后为200，实际浏览器读取始终成功。未据该代理失败重启或改动 DSA。
- 本轮无 DSA、Server 契约、数据库结构或 Mobile 改动；原调度器与逐次失败历史继续复用。真实外部资料读取、通知和业务配置写入均为0。工作区其他任务的改动保持，未提交代码。

## 最终复核

AC8 的管理、编辑、请求范围、冲突、幂等、刷新及错误恢复均有定向测试与浏览器证据；AC7 的本次受影响层级通过。共享监测组件的版本与原操作测试回归通过，规格与实现一致。真实来源执行、原生端及发布不在本轮验收范围内，无未归属实施项。
