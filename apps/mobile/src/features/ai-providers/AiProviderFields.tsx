import { Action, Choices, Copy, Field, Section } from '../../components/MobilePrimitives';
import type { AiProviderDraft } from './ai-provider-draft';
type Props = {
  draft: AiProviderDraft;
  change: (patch: Partial<AiProviderDraft>) => void;
  editing: boolean;
  disabled: boolean;
};
export function AiProviderFields({ draft, change, editing, disabled }: Props) {
  return (
    <>
      <Section title="模型服务">
        <Field
          label="来源名称"
          value={draft.name}
          onChange={(name) => change({ name })}
          editable={!editing && !disabled}
        />
        <Field
          label="模型服务地址"
          value={draft.baseUrl}
          onChange={(baseUrl) => change({ baseUrl })}
          editable={!disabled}
          keyboardType="url"
        />
        <Choices
          label="认证方式"
          value={draft.authMode}
          options={[
            { value: 'api_key', label: '密钥认证' },
            { value: 'none', label: '无需认证' },
          ]}
          onChange={(authMode) => change({ authMode })}
          disabled={disabled}
        />
        <Choices
          label="接口协议"
          value={draft.upstreamFormat}
          options={[
            { value: 'chat-completions', label: 'Chat Completions' },
            { value: 'responses', label: 'Responses' },
            { value: 'anthropic-messages', label: 'Anthropic Messages' },
          ]}
          onChange={(upstreamFormat) => change({ upstreamFormat })}
          disabled={disabled}
        />
        {draft.upstreamFormat === 'chat-completions' ? (
          <Choices
            label="Chat 实现"
            value={draft.chatImplementation}
            options={[
              { value: 'compatible', label: '兼容接口' },
              { value: 'openai-native', label: 'OpenAI 原生接口' },
            ]}
            onChange={(chatImplementation) => change({ chatImplementation })}
            disabled={disabled}
          />
        ) : null}
        <Choices
          label="OpenRouter 兼容扩展"
          value={String(draft.compatibility)}
          options={[
            { value: 'false', label: '关闭扩展' },
            { value: 'true', label: '启用扩展' },
          ]}
          onChange={(value) => change({ compatibility: value === 'true' })}
          disabled={disabled}
        />
        <Choices
          label="保存后的启停"
          value={String(draft.enabled)}
          options={[
            { value: 'false', label: '停用' },
            { value: 'true', label: '启用' },
          ]}
          onChange={(value) => change({ enabled: value === 'true' })}
          disabled={disabled}
        />
        <Field
          label="优先级"
          value={draft.priority}
          onChange={(priority) => change({ priority })}
          editable={!disabled}
          keyboardType="number-pad"
        />
        <Field
          label="能力（逗号分隔）"
          value={draft.capabilities}
          onChange={(capabilities) => change({ capabilities })}
          editable={!disabled}
        />
      </Section>
      <Section title="模型与费用">
        <Field
          label="已选模型（每行一个）"
          value={draft.models}
          onChange={(models) => change({ models })}
          multiline
          editable={!disabled}
        />
        <Copy muted>
          费用按每千 Token 填写；未填写代表未知，零单价需要明确填写
          0。价格、路由和推理配置均使用模型 ID 作为键。
        </Copy>
        <Field
          label="模型费用（JSON）"
          value={draft.modelPricing}
          onChange={(modelPricing) => change({ modelPricing })}
          multiline
          editable={!disabled}
        />
        <Field
          label="模型默认模式（JSON）"
          value={draft.modelDefaults}
          onChange={(modelDefaults) => change({ modelDefaults })}
          multiline
          editable={!disabled}
        />
        <Field
          label="模型推理配置（JSON）"
          value={draft.modelReasoning}
          onChange={(modelReasoning) => change({ modelReasoning })}
          multiline
          editable={!disabled}
        />
      </Section>
      <Section title="业务用途与超时">
        <Copy muted>
          用途路由含 model、mode、contract、启停及输出策略；连接成功不会自动验证这些用途。
        </Copy>
        <Field
          label="用途路由（JSON）"
          value={draft.executionRoutes}
          onChange={(executionRoutes) => change({ executionRoutes })}
          multiline
          editable={!disabled}
        />
        <Field
          label="连接超时（毫秒）"
          value={draft.timeoutMs}
          onChange={(timeoutMs) => change({ timeoutMs })}
          keyboardType="number-pad"
          editable={!disabled}
        />
        <Field
          label="首输出超时（毫秒）"
          value={draft.firstOutputTimeoutMs}
          onChange={(firstOutputTimeoutMs) => change({ firstOutputTimeoutMs })}
          keyboardType="number-pad"
          editable={!disabled}
        />
        <Field
          label="输出空闲超时（毫秒）"
          value={draft.outputIdleTimeoutMs}
          onChange={(outputIdleTimeoutMs) => change({ outputIdleTimeoutMs })}
          keyboardType="number-pad"
          editable={!disabled}
        />
        <Action
          label="清空调用超时覆盖"
          disabled={disabled}
          onPress={() =>
            change({ timeoutMs: '', firstOutputTimeoutMs: '', outputIdleTimeoutMs: '' })
          }
        />
      </Section>
    </>
  );
}
