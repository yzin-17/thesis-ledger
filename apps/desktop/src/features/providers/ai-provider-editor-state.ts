import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';
import { useRef, useState } from 'react';
import { createLatestRequestGate, createSingleFlightGate } from './ai-provider-editor-async.js';
import {
  useDeleteAiProviderMutation,
  useFetchAiProviderModelsMutation,
  useSaveAiProviderMutation,
  useSetAiProviderEnabledMutation,
  useTestAiProviderDraftMutation,
  useTestSavedAiProviderMutation,
} from './ai-provider.mutations.js';
import { useSaveProviderMutation, useTestProviderDraftMutation } from './providers.mutations.js';
import {
  newProviderDraft,
  type AiProviderModelDetail,
  type ProviderDraft,
  type ProviderTestEvidence,
  type ProviderTestState,
} from './providers.types.js';
export type ActiveAiTest = { name: string; requestId: string; controller: AbortController };
export function useAiProviderEditorState() {
  const [draft, setDraft] = useState<ProviderDraft>(newProviderDraft);
  const [open, setOpen] = useState(false);
  const [editingProviderName, setEditingProviderName] = useState<string | null>(null);
  const [credentialInputOpen, setCredentialInputOpen] = useState(true);
  const [testState, setTestState] = useState<ProviderTestState>('idle');
  const [testEvidence, setTestEvidence] = useState<ProviderTestEvidence | null>(null);
  const [testingProviderName, setTestingProviderName] = useState<string | null>(null);
  const [deletingProviderName, setDeletingProviderName] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelDetails, setModelDetails] = useState<AiProviderModelDetail[]>([]);
  const [modelRequestGate] = useState(createLatestRequestGate);
  const [testRequestGate] = useState(createLatestRequestGate);
  const [testFlight] = useState(createSingleFlightGate);
  const activeAiTestRef = useRef<ActiveAiTest | null>(null);
  const { confirm } = useConfirmDialog();
  const toastManager = useToastManager();
  const saveMutation = useSaveAiProviderMutation();
  const testDraftMutation = useTestAiProviderDraftMutation();
  const testSavedMutation = useTestSavedAiProviderMutation();
  const saveProviderMutation = useSaveProviderMutation();
  const testProviderDraftMutation = useTestProviderDraftMutation();
  const setEnabledMutation = useSetAiProviderEnabledMutation();
  const deleteMutation = useDeleteAiProviderMutation();
  const modelCatalogMutation = useFetchAiProviderModelsMutation();
  return {
    draft,
    setDraft,
    open,
    setOpen,
    editingProviderName,
    setEditingProviderName,
    credentialInputOpen,
    setCredentialInputOpen,
    testState,
    setTestState,
    testEvidence,
    setTestEvidence,
    testingProviderName,
    setTestingProviderName,
    deletingProviderName,
    setDeletingProviderName,
    availableModels,
    setAvailableModels,
    modelDetails,
    setModelDetails,
    modelRequestGate,
    testRequestGate,
    testFlight,
    activeAiTestRef,
    confirm,
    toastManager,
    saveMutation,
    testDraftMutation,
    testSavedMutation,
    saveProviderMutation,
    testProviderDraftMutation,
    setEnabledMutation,
    deleteMutation,
    modelCatalogMutation,
  };
}
export type AiProviderEditorState = ReturnType<typeof useAiProviderEditorState>;
