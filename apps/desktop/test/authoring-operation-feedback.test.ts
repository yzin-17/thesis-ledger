import { describe, expect, it } from 'vitest';
import { authoringFailureMessage } from '../src/features/strategy-authoring/authoring-operation-feedback.js';

describe('编写失败反馈', () => {
  it('期限和结果未知均提示先核对原操作及费用', () => {
    expect(authoringFailureMessage('AUTHORING_TIMEOUT', 'unknown')).toContain('超过执行期限');
    expect(authoringFailureMessage('AUTHORING_RESULT_UNKNOWN', 'unknown')).toContain(
      '先核对原操作和费用',
    );
    expect(authoringFailureMessage('AUTHORING_TRANSPORT_UNKNOWN', 'unknown')).toContain(
      '外部执行结果无法确认',
    );
  });
  it('已收到但无效的结果说明未应用，提供明确核对方向', () => {
    expect(authoringFailureMessage('AUTHORING_SCHEMA_INVALID', 'received')).toContain(
      '结构不符合要求',
    );
    expect(authoringFailureMessage('AUTHORING_COVERAGE_INVALID', 'received')).toContain('需求清单');
    expect(authoringFailureMessage('AUTHORING_SEMANTIC_MISMATCH', 'received')).toContain(
      '交易含义',
    );
  });
  it('主动取消与实际模型不一致有各自中文说明', () => {
    expect(authoringFailureMessage('AUTHORING_CANCELLED', 'not_sent')).toContain('已取消');
    expect(authoringFailureMessage('AUTHORING_MODEL_MISMATCH', 'received')).toContain(
      '完整模型标识',
    );
  });
  it('未来错误提供保留草稿和诊断入口，不直接回显技术码', () => {
    const message = authoringFailureMessage('FUTURE_ERROR', 'received');
    expect(message).toContain('草稿已保留');
    expect(message).toContain('查看诊断');
    expect(message).not.toContain('FUTURE_ERROR');
  });
});
