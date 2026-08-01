import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const app = await readFile(resolve(root, 'apps/desktop/src/ui/App.tsx'), 'utf8');
const styles = await readFile(resolve(root, 'apps/desktop/src/ui/styles.css'), 'utf8');
const mobile = await readFile(resolve(root, 'apps/mobile/src/index.ts'), 'utf8');
const electron = await readFile(resolve(root, 'apps/desktop/electron/main.cjs'), 'utf8');

const luminance = (hex) => {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrastRatio = (foreground, background) => {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
};

const checks = [
  ['Desktop 导航有 aria-label', /aria-label=\{label\}/u.test(app)],
  ['Desktop 当前导航有 aria-current', /aria-current=\{view === item/u.test(app)],
  ['真实按钮使用 focus-visible 轮廓', /button:focus-visible/u.test(styles)],
  ['输入控件使用 focus-visible 轮廓', /input:focus-visible/u.test(styles)],
  ['Desktop 有 800px 响应式断点', /@media \(max-width: 800px\)/u.test(styles)],
  ['Desktop 有 520px 小屏断点', /@media \(max-width: 520px\)/u.test(styles)],
  ['Desktop release 窗口允许 520px 响应式验收', /minWidth:\s*520/u.test(electron)],
  ['Desktop release 窗口允许小屏垂直空间', /minHeight:\s*520/u.test(electron)],
  ['动画支持 reduced-motion', /prefers-reduced-motion: reduce/u.test(styles)],
  ['高对比度模式保留系统颜色和焦点', /@media \(forced-colors: active\)/u.test(styles)],
  ['统一状态提示使用 status region', /role="status"/u.test(app)],
  [
    'Mobile 定义五类数据状态',
    /'loading' \| 'ready' \| 'empty' \| 'error' \| 'stale'/u.test(mobile),
  ],
  [
    'Desktop 主要辅助文字达到 WCAG AA 对比度',
    [
      ['#7e8983', '#171b1a'],
      ['#8c9691', '#171b1a'],
      ['#b6beb9', '#171b1a'],
    ].every(([foreground, background]) => contrastRatio(foreground, background) >= 4.5),
  ],
];

const failed = checks.filter(([, passed]) => !passed);
if (failed.length > 0) {
  console.error(`Accessibility/responsive 静态检查失败 (${failed.length}):`);
  for (const [label] of failed) console.error(`- ${label}`);
  process.exitCode = 1;
} else {
  console.log(`Accessibility/responsive 静态检查通过 (${checks.length} 项)`);
}
