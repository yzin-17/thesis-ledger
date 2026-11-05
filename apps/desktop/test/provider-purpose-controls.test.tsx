// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AiProviderExecutionFields } from '../src/features/providers/AiProviderExecutionFields.js';
import { newAiProviderDraft } from '../src/features/providers/providers.types.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('每个模型用途有独立可访问名称，分组标题不覆盖六个选项', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <AiProviderExecutionFields
          draft={{ ...newAiProviderDraft(), modelsText: '验收模型' }}
          onUpdateDraft={vi.fn()}
        />,
      ),
    );
    const controls = [...host.querySelectorAll('[role="checkbox"]')];
    expect(controls).toHaveLength(6);
    const names = controls.map((control) => {
      const references = control.getAttribute('aria-labelledby')?.trim();
      if (references)
        return references
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent)
          .join(' ');
      return control.getAttribute('aria-label');
    });
    expect(new Set(names).size).toBe(6);
    expect(names).toContain('验收模型 研究报告用途');
    expect(names).toContain('验收模型 参数优化用途');
    const inputIds = [...host.querySelectorAll('input[id]')].map((input) => input.id);
    expect(new Set(inputIds).size).toBe(inputIds.length);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
