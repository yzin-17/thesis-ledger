import { expect, it } from 'vitest';
import { tradePlanWireOutput } from './trade-plan-wire-output.fixture.js';

it.each([false, true])(
  '保留真实传输、仅捕获最终配置，即使根校验将拒绝（流式 %s）',
  async (streaming) => {
    const configuration = { definition: { schemaVersion: 3, name: '错误类型仍需保留' } };
    const content = JSON.stringify(configuration);
    const frame = {
      choices: [
        { [streaming ? 'delta' : 'message']: { content, reasoning_content: '不保存的推理' } },
      ],
    };
    const wire = streaming
      ? `data: ${JSON.stringify(frame)}\r\n\r\ndata: [DONE]\r\n\r\n`
      : JSON.stringify(frame);
    let captured: unknown;
    const response = tradePlanWireOutput(
      new Response(wire, {
        headers: { 'content-type': streaming ? 'text/event-stream' : 'application/json' },
      }),
      (value) => {
        captured = value;
      },
    );
    expect(await response.text()).toBe(wire);
    expect(captured).toEqual(configuration);
    expect(JSON.stringify(captured)).not.toContain('不保存的推理');
  },
);

it('不把残缺输出修成配置，不保存非 JSON 文本', async () => {
  let captured: unknown;
  const wire = JSON.stringify({ choices: [{ message: { content: '残缺输出 {' } }] });
  const response = tradePlanWireOutput(new Response(wire), (value) => {
    captured = value;
  });
  expect(await response.text()).toBe(wire);
  expect(captured).toEqual({ finalJsonAvailable: false });
});
