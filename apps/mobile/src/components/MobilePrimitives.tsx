import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import type { ReactNode } from 'react';
import { ListPageScrollView, MobileListRefreshRegion } from './MobileListRefresh';
export { MobileListRefreshRegion };
import { ThesisLedgerApiError, ThesisLedgerContractError } from '@thesis-ledger/api-client';
import { useMobileRuntime } from '../app/MobileRuntime';

export function failureMessage(error: unknown) {
  if (error instanceof ThesisLedgerContractError) return '读取数据与当前请求不一致，请重新读取。';
  if (error instanceof Error && error.name === 'AbortError')
    return '连接超时，请检查服务地址和网络后重试。';
  const expoFetchFailed = error instanceof Error && error.message.startsWith('fetch failed: ');
  if (expoFetchFailed || (error instanceof TypeError && /fetch|network/i.test(error.message)))
    return '网络连接失败，请检查服务地址和网络后重试。';
  if (error instanceof ThesisLedgerApiError)
    return error.payload?.message ?? `请求失败（${error.status}），请重试。`;
  if (error instanceof Error && error.name === 'ZodError')
    return '输入不符合当前数据要求，请核对数量、金额、日期及必填字段。';
  return error instanceof Error ? error.message : '操作失败，请重试。';
}
export function Page({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const { theme } = useMobileRuntime();
  return (
    <KeyboardAvoidingView
      style={[ui.flex, { backgroundColor: theme.pageBackground }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ListPageScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.page}>
        <View style={ui.titleRow}>
          <Text accessibilityRole="header" style={[ui.title, { color: theme.textPrimary }]}>
            {title}
          </Text>
          {action}
        </View>
        {children}
      </ListPageScrollView>
    </KeyboardAvoidingView>
  );
}
export function Copy({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const { theme } = useMobileRuntime();
  return (
    <Text selectable style={[ui.copy, { color: muted ? theme.textMuted : theme.textPrimary }]}>
      {children}
    </Text>
  );
}
export function Section({
  title,
  children,
  testID,
  variant = 'panel',
}: {
  title?: string;
  children: ReactNode;
  testID?: string;
  variant?: 'content' | 'panel';
}) {
  const { theme } = useMobileRuntime();
  return (
    <View
      testID={testID}
      style={[ui.section, { backgroundColor: theme.surface1, borderColor: theme.border },
        variant === 'content' && { borderWidth: 0, borderRadius: 0, padding: 0, backgroundColor: 'transparent' }]}
    >
      {title ? (
        <Text accessibilityRole="header" style={[ui.sectionTitle, { color: theme.textPrimary }]}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
export function ContentSection(props: Omit<Parameters<typeof Section>[0], 'variant'>) {
  return <Section {...props} variant="content" />;
}
export function Action({
  label,
  onPress,
  disabled = false,
  busy = false,
  primary = false,
  destructive = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  primary?: boolean;
  destructive?: boolean;
  testID?: string;
}) {
  const { theme } = useMobileRuntime();
  let color = theme.textPrimary;
  if (primary) color = theme.surface1;
  if (destructive) color = theme.error;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-busy={busy}
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        ui.action,
        {
          borderColor: theme.borderStrong,
          backgroundColor: primary ? theme.textPrimary : theme.surface1,
        },
        pressed && ui.pressed,
        (disabled || busy) && ui.disabled,
      ]}
    >
      {busy && <ActivityIndicator color={color} />}
      <Text style={[ui.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}
export function Field({
  label,
  placeholder,
  error,
  value,
  onChange,
  keyboardType,
  multiline = false,
  editable = true,
  secure = false,
  onFocus,
  onBlur,
}: {
  label: string;
  placeholder?: string | undefined;
  error?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  editable?: boolean;
  secure?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const { theme } = useMobileRuntime();
  return (
    <View style={ui.field}>
      <Copy>{label}</Copy>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        aria-invalid={Boolean(error)}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
        autoComplete="off"
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        style={[
          ui.input,
          multiline && ui.multiline,
          {
            color: theme.textPrimary,
            borderColor: error ? theme.error : theme.borderStrong,
            backgroundColor: theme.surface1,
          },
        ]}
      />
      <Feedback message={error} error />
    </View>
  );
}
export function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  inline = false,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  inline?: boolean;
}) {
  const { theme } = useMobileRuntime();
  return (
    <View style={[ui.field, inline && ui.row]}>
      <Copy>{label}</Copy>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={ui.wrap}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{
              checked: value === option.value,
              disabled: disabled || option.disabled === true,
            }}
            disabled={disabled || option.disabled === true}
            onPress={() => onChange(option.value)}
            style={[
              ui.choice,
              (disabled || option.disabled) && ui.disabled,
              {
                borderColor: value === option.value ? theme.textPrimary : theme.border,
                backgroundColor: value === option.value ? theme.surfaceHover : theme.surface1,
              },
            ]}
          >
            <Text
              style={[
                ui.copy,
                { color: theme.textPrimary, fontWeight: value === option.value ? '600' : '400' },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function Feedback({
  message,
  error = false,
  busy = false,
}: {
  message: string | null | undefined;
  error?: boolean;
  busy?: boolean;
}) {
  const { theme } = useMobileRuntime();
  if (!message && !busy) return null;
  return (
    <>
      {busy && <ActivityIndicator accessibilityLabel="正在处理" color={theme.brand} />}
      {message && (
        <Text
          accessibilityRole={error ? 'alert' : 'text'}
          style={[ui.copy, { color: error ? theme.error : theme.textSecondary }]}
        >
          {message}
        </Text>
      )}
    </>
  );
}
type ReadStatusProps = {
  query: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    data?: unknown;
    isFetching?: boolean;
    isFetchingNextPage?: boolean;
    fetchStatus?: 'paused' | 'fetching' | 'idle';
  };
  empty?: boolean | undefined;
  retry: () => void;
};

export function QueryList({
  query,
  empty,
  retry,
  label,
  gap,
  relatedRefreshing = false,
  children,
}: ReadStatusProps & {
  children: ReactNode;
  label?: string;
  gap?: number;
  relatedRefreshing?: boolean;
}) {
  const refreshing =
    (query.isFetching === true || relatedRefreshing) &&
    !query.isPending &&
    query.data !== undefined &&
    !query.isFetchingNextPage &&
    query.fetchStatus !== 'paused';
  return (
    <MobileListRefreshRegion refreshing={refreshing} label={label} gap={gap}>
      <QueryStatus query={query} empty={empty} retry={retry} inlineRefresh={false} />
      {children}
    </MobileListRefreshRegion>
  );
}

export function QueryStatus({
  query,
  empty,
  retry,
  inlineRefresh = true,
}: ReadStatusProps & { inlineRefresh?: boolean }) {
  const { theme } = useMobileRuntime();
  if (query.fetchStatus === 'paused') return <Copy muted>当前离线，连接恢复后继续读取。</Copy>;
  if (query.isPending && query.fetchStatus === 'idle') return null;
  if (query.isPending)
    return <ActivityIndicator accessibilityLabel="正在读取" color={theme.brand} />;
  if (query.isError)
    return (
      <Section>
        <Feedback message={failureMessage(query.error)} error />
        <Action
          label={query.isFetching ? '正在读取…' : '重新读取'}
          disabled={query.isFetching === true}
          busy={query.isFetching === true && (inlineRefresh || query.data === undefined)}
          onPress={retry}
        />
      </Section>
    );
  if (inlineRefresh && query.isFetching)
    return (
      <ActivityIndicator accessibilityLabel="正在刷新，显示上次读取的数据" color={theme.brand} />
    );
  if (empty) return <Copy muted>当前范围暂无数据。</Copy>;
  return null;
}

export const ui = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: 18, paddingBottom: 36, gap: 16 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: { fontSize: 24, fontWeight: '600', flexShrink: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  copy: { fontSize: 14, lineHeight: 21 },
  section: { padding: 16, gap: 12, borderRadius: 8, borderWidth: 1 },
  field: { gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  action: {
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: { fontSize: 14, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
