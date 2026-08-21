from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
source_path = root / 'apps/desktop/src/ui/App.tsx'
source = source_path.read_text()

# The active App shell/routes are now owned by src/app. Keep the legacy file as feature pages only.
source = source.replace(
    "import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';",
    "import { Navigate, useLocation, useNavigate } from 'react-router';",
)
source = source.replace("import { ThemeToggle } from '@/components/theme-toggle';\n", '')
source = source.replace("import { MarketDataSettings } from './MarketDataSettings.js';\n", '')
for icon in ('FlaskIcon', 'GearSixIcon', 'HouseIcon', 'RobotIcon', 'ShieldCheckIcon', 'StrategyIcon', 'UploadSimpleIcon'):
    source = re.sub(rf"import \{{ {icon} \}} from '@phosphor-icons/react/{icon.removesuffix('Icon')}';\n", '', source)
source = source.replace(
    "import { desktopPathForView, desktopRoutes, type DesktopNavigationView } from '../views.js';",
    "import type { DesktopNavigationView } from '../views.js';",
)

nav_start = source.index('const navIcons:')
nav_end = source.index('const money =', nav_start)
source = source[:nav_start] + source[nav_end:]

app_start = source.index('export function App() {')
app_end = source.index('function StrategyDashboard()', app_start)
source = source[:app_start] + source[app_end:]

for name in (
    'LegacyImportReviewRedirect',
    'StrategyDashboard',
    'AiChat',
    'JournalDashboard',
    'PerformanceDashboard',
    'RiskCenter',
    'PortfolioDashboard',
):
    source = source.replace(f'function {name}(', f'export function {name}(', 1)

# TASK-045: keep body cells aligned with the 7 semantic headers.
action_pattern = re.compile(
    r'''\n\s*<td>\n\s*<Button\n\s*className="text-button"\n\s*size="sm"\n\s*type="button"\n\s*variant="link"\n\s*onClick=\{\(\) => setDetailPosition\(position\)\}\n\s*>\n\s*查看\n\s*</Button>\n\s*</td>\n\s*<td>\{position\.quantity\}</td>''',
    re.MULTILINE,
)
source, count = action_pattern.subn('\n                      <td>{position.quantity}</td>', source, count=1)
if count != 1:
    raise RuntimeError(f'expected one misplaced portfolio action cell, found {count}')

status_pattern = re.compile(
    r'''(<td>\n\s*<Badge\n\s*className=\{position\.stale \? 'tag warning' : 'tag'\}\n\s*variant="secondary"\n\s*>\n\s*\{position\.stale \? '陈旧' : '最新'\}\n\s*</Badge>\n\s*</td>)''',
    re.MULTILINE,
)
action_cell = '''\1\n                      <td>\n                        <Button\n                          className="text-button"\n                          size="sm"\n                          type="button"\n                          variant="link"\n                          onClick={() => setDetailPosition(position)}\n                        >\n                          查看\n                        </Button>\n                      </td>'''
source, count = status_pattern.subn(action_cell, source, count=1)
if count != 1:
    raise RuntimeError(f'expected one portfolio status cell, found {count}')

legacy_path = root / 'apps/desktop/src/features/legacy-pages.tsx'
legacy_path.parent.mkdir(parents=True, exist_ok=True)
legacy_path.write_text(source)
source_path.write_text(
    "export { App } from '../app/App.js';\n"
    "export * from '../features/legacy-pages.js';\n"
)

market_compat = root / 'apps/desktop/src/ui/MarketDataSettings.tsx'
market_compat.write_text("export { MarketDataPage as MarketDataSettings } from '../features/market-data/MarketDataPage.js';\n")

# TASK-046: establish the progressive styles boundary without changing rendered rules.
styles_path = root / 'apps/desktop/src/ui/styles.css'
styles = styles_path.read_text()
tokens_start = styles.index(':root {')
base_start = styles.index('* {', tokens_start)
prefix = styles[:tokens_start]
tokens = styles[tokens_start:base_start]
base = prefix + styles[base_start:]
styles_dir = root / 'apps/desktop/src/styles'
styles_dir.mkdir(parents=True, exist_ok=True)
(styles_dir / 'tokens.css').write_text(tokens)
(styles_dir / 'base.css').write_text(base)
styles_path.write_text("@import '../styles/tokens.css';\n@import '../styles/base.css';\n")
