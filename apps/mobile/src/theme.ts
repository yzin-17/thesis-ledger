export type MobileThemePreference = 'system' | 'light' | 'dark';
export type MobileResolvedTheme = 'light' | 'dark';

export interface MobileThemeColors {
  pageBackground: string;
  sidebarBackground: string;
  surface1: string;
  surface2: string;
  surfaceHover: string;
  surfaceSelected: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  brand: string;
  brandHover: string;
  brandContrast: string;
  brandSoft: string;
  positive: string;
  positiveSoft: string;
  negative: string;
  negativeSoft: string;
  warning: string;
  warningSoft: string;
  error: string;
  errorSoft: string;
}

const lightTheme: MobileThemeColors = {
  pageBackground: '#f3f5f7',
  sidebarBackground: '#f7f8fa',
  surface1: '#fdfefe',
  surface2: '#f8fafc',
  surfaceHover: '#f1f5fa',
  surfaceSelected: '#eaf2ff',
  border: '#e0e5eb',
  borderStrong: '#cbd3dd',
  textPrimary: '#1d242d',
  textSecondary: '#596575',
  textMuted: '#66727f',
  brand: '#2c73e6',
  brandHover: '#205fca',
  brandContrast: '#f7faff',
  brandSoft: '#eaf2ff',
  positive: '#0b8c68',
  positiveSoft: '#e8f6f1',
  negative: '#cf4054',
  negativeSoft: '#fdecee',
  warning: '#a96b00',
  warningSoft: '#fff5df',
  error: '#c7393c',
  errorSoft: '#fdecec',
};

const darkTheme: MobileThemeColors = {
  pageBackground: '#111417',
  sidebarBackground: '#15191d',
  surface1: '#181c21',
  surface2: '#14181c',
  surfaceHover: '#20252b',
  surfaceSelected: '#102849',
  border: '#2a3038',
  borderStrong: '#3a424d',
  textPrimary: '#e6ebf1',
  textSecondary: '#a7b0bb',
  textMuted: '#8a95a2',
  brand: '#4e8df3',
  brandHover: '#6aa2ff',
  brandContrast: '#f7fbff',
  brandSoft: '#122b4e',
  positive: '#26c59a',
  positiveSoft: '#102d25',
  negative: '#ff6d7d',
  negativeSoft: '#3a2025',
  warning: '#e0ad56',
  warningSoft: '#3a2e1a',
  error: '#ff7676',
  errorSoft: '#3a2020',
};

export function getMobileTheme(theme: MobileResolvedTheme): MobileThemeColors {
  return theme === 'dark' ? darkTheme : lightTheme;
}

export const mobileThemeLabels: Record<MobileThemePreference, string> = {
  system: '系统',
  light: '浅色',
  dark: '深色',
};
