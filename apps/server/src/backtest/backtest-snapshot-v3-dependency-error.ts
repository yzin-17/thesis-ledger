export type SnapshotDependencyV3ErrorReason =
  | 'dependency_plan_mismatch'
  | 'unsupported_dependency'
  | 'request_scope_invalid'
  | 'response_unavailable'
  | 'response_contract_invalid'
  | 'response_scope_mismatch'
  | 'fact_unavailable'
  | 'future_fact'
  | 'model_scope_mismatch'
  | 'event_plan_blocked'
  | 'artifact_mismatch';

/** 非价格依赖验证的稳定错误；独立于读取及产物装配。 */
export class SnapshotDependencyV3Error extends Error {
  readonly code = 'DATA_UNAVAILABLE';

  constructor(
    readonly reason: SnapshotDependencyV3ErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'SnapshotDependencyV3Error';
  }
}
