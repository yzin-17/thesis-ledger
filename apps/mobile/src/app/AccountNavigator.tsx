import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AccountStackParams } from './navigation-types';
import { AccountsScreen } from '../features/accounts/AccountsScreen';
import { AccountEditor } from '../features/accounts/AccountEditor';
import { AccountWorkspace } from '../features/accounts/AccountWorkspace';
import { BaselineScreen } from '../features/account-baselines/BaselineScreen';
import { DraftsScreen } from '../features/import-review/DraftsScreen';
import { DraftReviewScreen } from '../features/import-review/DraftReviewScreen';
import { ExecutionsScreen } from '../features/executions/ExecutionsScreen';
import { ExecutionEditor } from '../features/executions/ExecutionEditor';
import { AuditScreen } from '../features/executions/AuditScreen';
import { ReconciliationScreen } from '../features/reconciliation/ReconciliationScreen';
import { CashScreen } from '../features/cash-observations/CashScreen';
import { CashEditor } from '../features/cash-observations/CashEditor';
import { TransfersScreen } from '../features/cash-transfers/TransfersScreen';
import { TransferEditor } from '../features/cash-transfers/TransferEditor';
import { PlansScreen } from '../features/recurring-plans/PlansScreen';
import { PlanEditor } from '../features/recurring-plans/PlanEditor';
import { OccurrenceEditor } from '../features/recurring-plans/OccurrenceEditor';
const Stack = createNativeStackNavigator<AccountStackParams>();
export function AccountNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerTitle: '', headerBackTitle: '返回' }}>
      <Stack.Screen
        name="AccountsHome"
        component={AccountsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="AccountEditor" component={AccountEditor} />
      <Stack.Screen name="AccountWorkspace" component={AccountWorkspace} />
      <Stack.Screen name="Baseline" component={BaselineScreen} />
      <Stack.Screen name="Drafts" component={DraftsScreen} />
      <Stack.Screen name="DraftReview" component={DraftReviewScreen} />
      <Stack.Screen name="Executions" component={ExecutionsScreen} />
      <Stack.Screen name="ExecutionEditor" component={ExecutionEditor} />
      <Stack.Screen name="Reconciliation" component={ReconciliationScreen} />
      <Stack.Screen name="Audit" component={AuditScreen} />
      <Stack.Screen name="Cash" component={CashScreen} />
      <Stack.Screen name="CashEditor" component={CashEditor} />
      <Stack.Screen name="Transfers" component={TransfersScreen} />
      <Stack.Screen name="TransferEditor" component={TransferEditor} />
      <Stack.Screen name="Plans" component={PlansScreen} />
      <Stack.Screen name="PlanEditor" component={PlanEditor} />
      <Stack.Screen name="OccurrenceEditor" component={OccurrenceEditor} />
    </Stack.Navigator>
  );
}
