import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { AccountResponse } from '@thesis-ledger/api-client';

import type { MobileThemeColors } from '../theme';
import type { MobileStyles } from '../styles/mobileStyles';

const accountTypeLabel = (type: AccountResponse['type']) => {
  if (type === 'fund') return '基金';
  if (type === 'cash') return '现金';
  return '证券';
};

export const mobileAccountScreenState = (accounts: AccountResponse[], error: unknown) => ({
  empty: accounts.length === 0,
  showQueryRetry: Boolean(error),
});

export function MobileAccountScreen({
  accounts,
  mode,
  loading,
  error,
  feedback,
  pendingAccountId,
  onDelete,
  onRetry,
  theme,
  styles,
}: {
  accounts: AccountResponse[];
  mode: 'actual' | 'shadow';
  loading: boolean;
  error: unknown;
  feedback: string | null;
  pendingAccountId: string | undefined;
  onDelete: (account: AccountResponse) => void;
  onRetry: () => void;
  theme: MobileThemeColors;
  styles: MobileStyles;
}) {
  const accountState = mobileAccountScreenState(accounts, error);
  if (loading && accounts.length === 0)
    return <ActivityIndicator accessibilityLabel="正在加载账户" size="large" color={theme.brand} />;

  if (accountState.showQueryRetry && accountState.empty) {
    return (
      <View style={styles.accountFeedback} accessibilityRole="alert">
        <Text style={styles.accountErrorText}>账户读取失败，请检查网络后重试。</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.accountRetryButton}>
          <Text style={styles.accountRetryText}>重新加载</Text>
        </Pressable>
      </View>
    );
  }

  if (accountState.empty) {
    return (
      <Text style={styles.emptyText} accessibilityRole="text">
        当前{mode === 'shadow' ? '模拟' : '实际'}范围暂无账户。
      </Text>
    );
  }

  return (
    <View style={styles.accountList}>
      <Text style={styles.sectionTitle}>账户</Text>
      {accountState.showQueryRetry && (
        <View style={styles.accountFeedback} accessibilityRole="alert">
          <Text style={styles.accountErrorText}>账户列表未刷新，请检查网络后重试。</Text>
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.accountRetryButton}>
            <Text style={styles.accountRetryText}>重新加载</Text>
          </Pressable>
        </View>
      )}
      {feedback && <Text style={styles.accountErrorText} accessibilityRole="alert">{feedback}</Text>}
      {accounts.map((account) => {
        const deleting = pendingAccountId === account.id;
        return (
          <View key={account.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.symbol}>{account.name}</Text>
              <Text style={account.active ? styles.mutedText : styles.staleText}>
                {account.active ? '启用中' : '已停用'}
              </Text>
            </View>
            <Text style={styles.cardText}>
              {account.institution || '未填写机构'} · {accountTypeLabel(account.type)} · {account.currency}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`永久删除账户 ${account.name}`}
              accessibilityState={{ disabled: Boolean(pendingAccountId) }}
              disabled={Boolean(pendingAccountId)}
              onPress={() => onDelete(account)}
              style={({ pressed }) => [
                styles.accountDeleteButton,
                Boolean(pendingAccountId) && styles.accountDeleteButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.accountDeleteText}>{deleting ? '删除中…' : '永久删除'}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
