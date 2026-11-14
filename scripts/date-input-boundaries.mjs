const uiPrefix = 'apps/desktop/src/components/ui/';
const dateModules = [
  'date-input.tsx',
  'date-input.types.ts',
  'use-date-input-editor.ts',
  'date-selection-panel.tsx',
  'calendar.tsx',
  'popover.tsx',
];

export function dateInputBoundaryViolation(file, source) {
  if (!file.startsWith('apps/desktop/src/')) return null;
  if (
    file !== `${uiPrefix}date-input.tsx` &&
    /<(?:Input|input|InputGroupInput)\b(?:(?!\/>)[\s\S])*?\btype=["'](?:date|datetime-local|month)["']/u.test(
      source,
    )
  ) {
    return '日期、月份与日期时间输入必须消费公共 DateInput';
  }
  if (dateModules.some((name) => file === `${uiPrefix}${name}`)) {
    if (
      file === `${uiPrefix}date-input.tsx` &&
      /text-transparent|text-fill-color:transparent/u.test(source)
    )
      return '日期输入必须统一使用可见文本编辑，不得通过透明原生输入切换聚焦格式';
    if (/\bshowPicker\s*\(/u.test(source))
      return '公共日期输入必须使用主题面板，不得打开原生日期弹层';
    if (
      /from\s+['"][^'"]*(?:\/features\/|\/shared\/api|@thesis-ledger\/api-client)/u.test(source)
    ) {
      return '公共日期展示只消费输入契约，不得反向依赖业务特性或请求编排';
    }
  }
  return null;
}
