import { Moon, Sun } from 'lucide-react';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { useTheme, type ThemePreference } from '@/ui/theme';

const labels: Record<ThemePreference, string> = {
  system: '系统',
  light: '浅色',
  dark: '深色',
};

export function ThemeToggle() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const currentLabel =
    preference === 'system' ? `系统（${isDark ? labels.dark : labels.light}）` : labels[preference];
  const nextLabel = isDark ? labels.light : labels.dark;

  return (
    <Switch
      aria-label={`切换到${nextLabel}主题，当前为${currentLabel}`}
      checked={isDark}
      className="theme-switch"
      title={`当前为${currentLabel}，切换到${nextLabel}`}
      onCheckedChange={(checked) => setPreference(checked ? 'dark' : 'light')}
    >
      <SwitchThumb className="theme-switch-thumb">
        {isDark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
      </SwitchThumb>
    </Switch>
  );
}
