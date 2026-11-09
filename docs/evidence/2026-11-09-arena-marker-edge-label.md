# 模拟买卖标记的边缘文字对齐验收

## 展示行为

模拟买卖标记的文字始终以箭头横坐标为中心，显示在箭头下方。箭头接近或越过绘图区左右边缘时，文字随箭头一起裁切，避免文字单独向内移动后与箭头错位。悬浮命中区域沿用实际文字坐标。

修改范围为 Desktop 的 `market-arena-marker-primitive.ts` 及对应测试；模型模拟成交标记由 `market-trading-overlay-resources.ts` 挂载该实现。

## 验证结果

- 定向测试：`pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail/market-arena-marker-primitive.test.ts src/features/market-detail/market-trading-overlay-resources.test.ts`，2 个文件、15 项通过。
- Desktop 构建：`pnpm --filter @thesis-ledger/desktop build`，类型检查及 Vite 构建通过，保留现有 chunk 大小提示。日志：`/tmp/arena-marker-edge-build.log`。
- 浏览器：本地 Vite 源码、Microsoft Edge、真实 Lightweight Charts 与实际标记 primitive，使用受控行情和模拟成交样本。覆盖 1440、1024、768、390 四种宽度下的左边缘、右边缘，以及两侧越界场景，共 16 项通过。
- 浏览器检查买卖文字中心与箭头横坐标一致、可见买入文字的悬浮命中、页面横向溢出及脚本异常；已查看 390 宽度左右边缘截图。
- 浏览器脚本：`/tmp/check-arena-marker-edge.cjs`；结果与截图：`/tmp/arena-marker-edge-qa/`。

## 验收边界

浏览器使用受控输入，未读写真实业务数据。本次仅修改前端绘制坐标，已更新宿主机 Desktop 构建产物；Docker 服务和镜像未更新。
