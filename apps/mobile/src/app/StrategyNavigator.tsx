import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { StrategyStackParams } from './strategy-navigation';
import { StrategyLibraryScreen } from '../features/strategy-library/StrategyLibraryScreen';
import { StrategyVersionScreen } from '../features/strategy-library/StrategyVersionScreen';
import { StrategyEditorScreen } from '../features/strategy-editor/StrategyEditorScreen';
import { StrategyAuthoringScreen } from '../features/strategy-authoring/StrategyAuthoringScreen';
import { BacktestSetupScreen } from '../features/backtest-setup/BacktestSetupScreen';
import { BacktestJobsScreen } from '../features/backtest-jobs/BacktestJobsScreen';
import { BacktestResultScreen } from '../features/backtest-results/BacktestResultScreen';
import { OptimizationSetupScreen } from '../features/optimization-setup/OptimizationSetupScreen';
import { OptimizationResultsScreen } from '../features/optimization-results/OptimizationResultsScreen';
import { OptimizationAdoptionScreen } from '../features/optimization-adoption/OptimizationAdoptionScreen';
import { StrategyRiskScreen } from '../features/strategy-risk/StrategyRiskScreen';
import { StrategyRiskCreateScreen } from '../features/strategy-risk/StrategyRiskCreateScreen';
import { StrategyRiskEditorScreen } from '../features/strategy-risk/StrategyRiskEditorScreen';
const Stack = createNativeStackNavigator<StrategyStackParams>();
export function StrategyNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerTitle: '', headerBackTitle: '返回' }}>
      <Stack.Screen
        name="StrategyLibrary"
        component={StrategyLibraryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="StrategyVersion" component={StrategyVersionScreen} />
      <Stack.Screen name="StrategyEditor" component={StrategyEditorScreen} />
      <Stack.Screen name="StrategyAuthoring" component={StrategyAuthoringScreen} />
      <Stack.Screen name="BacktestSetup" component={BacktestSetupScreen} />
      <Stack.Screen name="BacktestJobs" component={BacktestJobsScreen} />
      <Stack.Screen name="BacktestResult" component={BacktestResultScreen} />
      <Stack.Screen name="OptimizationSetup" component={OptimizationSetupScreen} />
      <Stack.Screen name="OptimizationResults" component={OptimizationResultsScreen} />
      <Stack.Screen name="OptimizationAdoption" component={OptimizationAdoptionScreen} />
      <Stack.Screen name="StrategyRisk" component={StrategyRiskScreen} />
      <Stack.Screen name="StrategyRiskCreate" component={StrategyRiskCreateScreen} />
      <Stack.Screen name="StrategyRiskEditor" component={StrategyRiskEditorScreen} />
    </Stack.Navigator>
  );
}
