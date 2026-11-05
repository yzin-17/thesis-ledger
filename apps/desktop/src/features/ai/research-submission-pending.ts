import { normalizeResearchSubmissionV2, type ResearchSubmissionV2 } from '@thesis-ledger/schemas';

const key = (owner: string, mode: ResearchSubmissionV2['mode']) =>
  `thesis-ledger:research-pending:${owner}:${mode}`;
/** 只保存尚未确认的提交输入；身份和模式分隔，不保存认证信息。 */
export function readPendingResearch(
  owner: string,
  mode: ResearchSubmissionV2['mode'],
): ResearchSubmissionV2 | null {
  try {
    const raw = sessionStorage.getItem(key(owner, mode));
    if (!raw) return null;
    const value = normalizeResearchSubmissionV2(JSON.parse(raw));
    return value.mode === mode ? value : null;
  } catch {
    return null;
  }
}
export function savePendingResearch(
  owner: string,
  input: ResearchSubmissionV2 | null,
  mode: ResearchSubmissionV2['mode'],
) {
  try {
    if (input) sessionStorage.setItem(key(owner, mode), JSON.stringify(input));
    else sessionStorage.removeItem(key(owner, mode));
    return true;
  } catch {
    return false;
  }
}
