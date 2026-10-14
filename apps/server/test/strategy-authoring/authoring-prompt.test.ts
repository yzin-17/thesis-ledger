import { describe, expect, it } from 'vitest';
import { authoringMessages } from '../../src/strategy-authoring/authoring-prompt.js';
import type { AuthoringOperation } from '../../src/strategy-authoring/authoring-operation.repository.js';
const operation = {
  revision: 3,
  input: {
    content: { description: '只用用户确认条件' },
    selection: { kind: 'generate', intent: '' },
  },
} as AuthoringOperation;
describe('编写生产提示的实际 AST 合同', () => {
  it('补充 unknown 字段之外的 AST 语法，保留用户确认和 NAV 能力', () => {
    const messages = authoringMessages(operation);
    expect(messages[0]!.content).toContain('条件 AST 合同');
    expect(messages[0]!.content).toContain('sourceId');
    expect(messages[0]!.content).toContain('MA表示简单移动均线');
    expect(messages[0]!.content).toContain('必须省略 benchmark');
    expect(messages[0]!.content).toContain('不得使用 definition. 前缀');
    expect(messages[0]!.content).toContain('risk.0.percent');
    expect(messages[0]!.content).toContain('下一可用净值申购/赎回');
    expect(JSON.parse(messages[1]!.content).content.description).toBe('只用用户确认条件');
    expect(messages[0]!.content).toContain('严格复用 content.confirmation');
  });
});
