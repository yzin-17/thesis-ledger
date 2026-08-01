import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme, type ThemePreference } from '@/ui/theme';

const labels: Record<ThemePreference, string> = {
  system: '系统',
  light: '浅色',
  dark: '深色',
};

const icons = {
  system: Monitor,
  light: Sun,
  dark: Moon,
} satisfies Record<ThemePreference, typeof Monitor>;

export function ThemeToggle() {
  const { preference, cyclePreference } = useTheme();
  const Icon = icons[preference];

  return (
    <Button
      aria-label={`切换主题，当前为${labels[preference]}`}
      className="theme-toggle"
      size="sm"
      title={`主题：${labels[preference]}`}
      type="button"
      variant="ghost"
      onClick={cyclePreference}
    >
      <Icon aria-hidden="true" size={15} />
      <span>主题：{labels[preference]}</span>
    </Button>
  );
}
