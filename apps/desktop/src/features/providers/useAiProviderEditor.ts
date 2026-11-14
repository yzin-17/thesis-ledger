import {
  createAiProviderCatalogActions,
  createAiProviderEditorDraftActions,
  createAiProviderSaveActions,
} from './ai-provider-editor-draft-actions.js';
import { createAiProviderLifecycleActions } from './ai-provider-editor-lifecycle-actions.js';
import { useAiProviderEditorState } from './ai-provider-editor-state.js';
import {
  createAiProviderDraftTest,
  createAiProviderSavedTest,
  createAiProviderTestLifecycle,
  createOrdinaryProviderTest,
} from './ai-provider-editor-test-actions.js';
import { type AiRoutingSettings } from './ai-provider.api.js';
export const useAiProviderEditor = (routingSettings?: AiRoutingSettings) => {
  const state = useAiProviderEditorState();
  const draftActions = createAiProviderEditorDraftActions(state);
  const catalog = createAiProviderCatalogActions(state);
  const save = createAiProviderSaveActions(state, draftActions);
  const active = createAiProviderTestLifecycle(state);
  const ordinary = createOrdinaryProviderTest(state, draftActions);
  const generation = createAiProviderDraftTest(state, ordinary, active);
  const saved = createAiProviderSavedTest(state, active);
  const lifecycle = createAiProviderLifecycleActions(state, routingSettings);
  const {
    open,
    editingProviderName,
    draft,
    credentialInputOpen,
    testState,
    saveMutation,
    saveProviderMutation,
    availableModels,
    modelDetails,
    modelCatalogMutation,
    setOpen,
    setCredentialInputOpen,
    testingProviderName,
    deletingProviderName,
  } = state;
  const { close, openEditor, changeType, updateDraft, resetTest, changeAuthMode } = draftActions;
  const { fetchModels } = catalog;
  const { testDraft } = generation;
  const { cancelTest } = active;
  const { saveDraft } = save;
  const { testSaved } = saved;
  const { toggle, remove } = lifecycle;
  return {
    close,
    openEditor,
    changeType,
    updateDraft,
    fetchModels,
    testDraft,
    cancelTest,
    saveDraft,
    testSaved,
    toggle,
    remove,
    editor: {
      open,
      editingProviderName,
      providerDraft: draft,
      credentialInputOpen,
      providerTestState: testState,
      savingProviderDraft: saveMutation.isPending || saveProviderMutation.isPending,
      availableModels,
      modelDetails,
      modelCatalogState: modelCatalogMutation.isPending ? ('loading' as const) : ('idle' as const),
      onOpenChange: (nextOpen: boolean) => (nextOpen ? setOpen(true) : close()),
      onResetTest: resetTest,
      onSetCredentialInputOpen: setCredentialInputOpen,
      onAuthModeChange: changeAuthMode,
    },
    testingProviderName,
    deletingProviderName,
  };
};
