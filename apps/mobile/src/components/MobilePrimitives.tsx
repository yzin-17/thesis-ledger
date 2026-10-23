import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import type { ReactNode } from 'react';
import { ThesisLedgerApiError, ThesisLedgerContractError } from '@thesis-ledger/api-client';
import { useMobileRuntime } from '../app/MobileRuntime';

export function failureMessage(error: unknown) {
  if (error instanceof ThesisLedgerContractError) return '读取数据与当前请求不一致，请重新读取。';
  if (error instanceof Error && error.name === 'AbortError')
    return '连接超时，请检查服务地址和网络后重试。';
  if (error instanceof TypeError && /fetch|network/i.test(error.message))
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
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.page}>
        <View style={ui.titleRow}>
          <Text accessibilityRole="header" style={[ui.title, { color: theme.textPrimary }]}>
            {title}
          </Text>
          {action}
        </View>
        {children}
      </ScrollView>
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
}: {
  title?: string;
  children: ReactNode;
  testID?: string;
}) {
  const { theme } = useMobileRuntime();
  return (
    <View
      testID={testID}
      style={[ui.section, { backgroundColor: theme.surface1, borderColor: theme.border }]}
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
export function Action({
  label,
  onPress,
  disabled = false,
  primary = false,
  destructive = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
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
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        ui.action,
        {
          borderColor: theme.borderStrong,
          backgroundColor: primary ? theme.textPrimary : theme.surface1,
        },
        pressed && ui.pressed,
        disabled && ui.disabled,
      ]}
    >
      <Text style={[ui.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  keyboardType,
  multiline = false,
  editable = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  editable?: boolean;
}) {
  const { theme } = useMobileRuntime();
  return (
    <View style={ui.field}>
      <Copy>{label}</Copy>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        style={[
          ui.input,
          multiline && ui.multiline,
          {
            color: theme.textPrimary,
            borderColor: theme.borderStrong,
            backgroundColor: theme.surface1,
          },
        ]}
      />
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
}: {
  message: string | null | undefined;
  error?: boolean;
}) {
  const { theme } = useMobileRuntime();
  if (!message) return null;
  return (
    <Text
      accessibilityRole={error ? 'alert' : 'text'}
      style={[ui.copy, { color: error ? theme.error : theme.textSecondary }]}
    >
      {message}
    </Text>
  );
}
export function QueryStatus({
  query,
  empty,
  retry,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    isFetching?: boolean;
    fetchStatus?: 'paused' | 'fetching' | 'idle';
  };
  empty?: boolean;
  retry: () => void;
}) {
  if (query.fetchStatus === 'paused') return <Copy muted>当前离线，连接恢复后继续读取。</Copy>;
  if (query.isPending) return <ActivityIndicator accessibilityLabel="正在读取" />;
  if (query.isError)
    return (
      <Section>
        <Feedback message={failureMessage(query.error)} error />
        <Action
          label={query.isFetching ? '正在读取…' : '重新读取'}
          disabled={query.isFetching === true}
          onPress={retry}
        />
      </Section>
    );
  if (empty) return <Copy muted>当前范围暂无数据。</Copy>;
  if (query.isFetching) return <Copy muted>正在更新，当前显示上次读取的数据。</Copy>;
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
