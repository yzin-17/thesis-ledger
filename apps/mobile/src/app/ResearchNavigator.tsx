import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ResearchStackParams } from './navigation-types';
import { ResearchHome } from '../features/research-read/ResearchHome';
import { ResearchReportScreen } from '../features/research-read/ResearchReportScreen';
import { ResearchEvidenceScreen } from '../features/research-read/ResearchEvidenceScreen';
import { ResearchSubmitScreen } from '../features/research-submit/ResearchSubmitScreen';
import { ResearchReviewScreen } from '../features/research-review/ResearchReviewScreen';
import { JournalScreen } from '../features/journal-trade/JournalScreen';
import { JournalObjectScreen } from '../features/journal-trade/JournalObjectScreen';
import { JournalPeriodScreen } from '../features/journal-period/JournalPeriodScreen';
import { JournalHistoryScreen } from '../features/journal-period/JournalHistoryScreen';
import { JournalAiHistoryScreen } from '../features/journal-ai/JournalAiHistoryScreen';
import { JournalEvidenceScreen } from '../features/journal-ai/JournalEvidenceScreen';
import { StrategyNavigator } from './StrategyNavigator';
const Stack = createNativeStackNavigator<ResearchStackParams>();
export function ResearchNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerTitle: '', headerBackTitle: '返回' }}>
      <Stack.Screen name="ResearchHome" component={ResearchHome} options={{ headerShown: false }} />
      <Stack.Screen name="Strategy" component={StrategyNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="Journal" component={JournalScreen} />
      <Stack.Screen name="JournalObject" component={JournalObjectScreen} />
      <Stack.Screen name="JournalPeriod" component={JournalPeriodScreen} />
      <Stack.Screen name="JournalHistory" component={JournalHistoryScreen} />
      <Stack.Screen name="JournalAiHistory" component={JournalAiHistoryScreen} />
      <Stack.Screen name="JournalEvidence" component={JournalEvidenceScreen} />
      <Stack.Screen name="ResearchReport" component={ResearchReportScreen} />
      <Stack.Screen name="ResearchEvidence" component={ResearchEvidenceScreen} />
      <Stack.Screen name="ResearchSubmit" component={ResearchSubmitScreen} />
      <Stack.Screen name="ResearchReview" component={ResearchReviewScreen} />
    </Stack.Navigator>
  );
}
