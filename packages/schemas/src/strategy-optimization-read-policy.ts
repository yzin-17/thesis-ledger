import type { ResultReadEligibility } from './strategy-optimization.js';
type ExperimentPolicy={status:string;stage:string;readEligibility?:ResultReadEligibility|undefined;lockedCandidateIds?:string[]|null|undefined};
type CandidatePolicy={id:string;validationStatus:string;readEligibility?:ResultReadEligibility|undefined;metrics:Record<string,unknown>};
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function canRevealTestMetrics(experiment:ExperimentPolicy,candidate?:CandidatePolicy) {
  return experiment.readEligibility?.state==='readable'&&(!candidate||candidate.readEligibility?.state==='readable');
}
export function canSelectCandidateForTest(experiment:ExperimentPolicy,candidate:CandidatePolicy,retryRequired:boolean) {
  if(experiment.stage!=='awaiting_finalization'||retryRequired)return false;
  if(candidate.validationStatus==='valid')return true;
  if(candidate.validationStatus!=='restricted'||candidate.readEligibility?.state!=='restricted')return false;
  return record(candidate.metrics.development).status==='valid'&&record(candidate.metrics.validation).status==='valid';
}
export function candidateAdoptionEligibility(experiment:ExperimentPolicy,candidate:CandidatePolicy) {
  if(!canRevealTestMetrics(experiment,candidate))return '封存测试结果尚未揭示';
  if(experiment.status!=='succeeded'||experiment.stage!=='completed')return '实验尚未完成封存测试';
  if(candidate.validationStatus==='test_valid')return null;
  if(!experiment.lockedCandidateIds?.includes(candidate.id))return '未进入封存测试';
  return '候选未通过封存测试';
}
