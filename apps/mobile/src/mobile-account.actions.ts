import { ThesisLedgerApiError, type AccountResponse } from '@thesis-ledger/api-client';

export type MobileConfirmationButton = {
  text: string;
  style?: 'cancel' | 'destructive';
  onPress: () => void;
};

export type MobileConfirmationAlert = (
  title: string,
  message: string,
  buttons: MobileConfirmationButton[],
  options: { cancelable: true; onDismiss: () => void },
) => void;

export const mobileAccountDeletionErrorMessage = (error: unknown) => {
  if (error instanceof ThesisLedgerApiError && error.status === 409)
    return error.payload?.message ?? '账户仍有关联数据，暂时无法永久删除。';
  return '网络或服务暂不可用，请检查网络后重试。';
};

export const confirmMobileAccountDeletion = (
  account: AccountResponse,
  showAlert: MobileConfirmationAlert,
) =>
  new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      resolve(confirmed);
    };
    showAlert(
      `永久删除账户“${account.name}”？`,
      `账户“${account.name}”删除后无法恢复。`,
      [
        { text: '取消', style: 'cancel', onPress: () => settle(false) },
        { text: '永久删除', style: 'destructive', onPress: () => settle(true) },
      ],
      { cancelable: true, onDismiss: () => settle(false) },
    );
  });

export const createMobileAccountDeletionHandler = ({
  isPending,
  confirm,
  permanentlyDelete,
  onSuccess,
  onError,
}: {
  isPending: () => boolean;
  confirm: (account: AccountResponse) => Promise<boolean>;
  permanentlyDelete: (accountId: string) => Promise<void>;
  onSuccess: (accountId: string) => void;
  onError: (error: unknown) => void;
}) => {
  let inProgress = false;

  return async (account: AccountResponse) => {
    if (isPending() || inProgress) return;
    inProgress = true;
    try {
      if (!(await confirm(account))) return;
      await permanentlyDelete(account.id);
      onSuccess(account.id);
    } catch (error) {
      onError(error);
    } finally {
      inProgress = false;
    }
  };
};
