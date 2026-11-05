import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeResearchSubmissionV2, type ResearchSubmissionV2 } from '@thesis-ledger/schemas';
export const researchPendingKey = (baseUrl: string, mode: string) =>
  JSON.stringify(['mobile-research-pending-v1', baseUrl, mode]);
export async function readResearchPending(key: string): Promise<ResearchSubmissionV2 | null> {
  const value = await AsyncStorage.getItem(key);
  return value ? normalizeResearchSubmissionV2(JSON.parse(value)) : null;
}
export async function saveResearchPending(key: string, value: ResearchSubmissionV2 | null) {
  if (value) await AsyncStorage.setItem(key, JSON.stringify(normalizeResearchSubmissionV2(value)));
  else await AsyncStorage.removeItem(key);
}
