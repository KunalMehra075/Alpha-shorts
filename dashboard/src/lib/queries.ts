import {
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { api } from './api';
import type { Language, Scene, ScriptVersion } from './types';

export const qk = {
  workspaces: ['workspaces'] as const,
  workspace: (id: string) => ['workspace', id] as const,
  script: (id: string) => ['script', id] as const,
  scriptVersions: (id: string) => ['script-versions', id] as const,
  voices: ['voices'] as const,
  audio: (id: string) => ['audio', id] as const,
  captions: (id: string) => ['captions', id] as const,
  templates: ['templates'] as const,
  stats: ['stats'] as const
};

// ── Workspaces ────────────────────────────────────────────────────────────
export function useWorkspaces() {
  return useQuery({ queryKey: qk.workspaces, queryFn: api.listWorkspaces });
}

export function useWorkspace(id: string | undefined) {
  return useQuery({
    queryKey: qk.workspace(id ?? ''),
    queryFn: () => api.getWorkspace(id!),
    enabled: !!id
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, language }: { name: string; language?: Language }) =>
      api.createWorkspace(name, language),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workspaces });
      qc.invalidateQueries({ queryKey: qk.stats });
    }
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; language?: Language } }) =>
      api.updateWorkspace(id, patch),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: qk.workspaces });
      qc.invalidateQueries({ queryKey: qk.workspace(m.id) });
    }
  });
}

export function useDuplicateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.duplicateWorkspace(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workspaces })
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteWorkspace(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workspaces });
      qc.invalidateQueries({ queryKey: qk.stats });
    }
  });
}

// ── Script ──────────────────────────────────────────────────────────────────
export function useScript(id: string | undefined) {
  return useQuery({
    queryKey: qk.script(id ?? ''),
    queryFn: () => api.getScript(id!),
    enabled: !!id
  });
}

export function useScriptVersions(id: string | undefined) {
  return useQuery({
    queryKey: qk.scriptVersions(id ?? ''),
    queryFn: () => api.listScriptVersions(id!),
    enabled: !!id
  });
}

function invalidateScript(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: qk.script(id) });
  qc.invalidateQueries({ queryKey: qk.scriptVersions(id) });
  qc.invalidateQueries({ queryKey: qk.workspace(id) });
  qc.invalidateQueries({ queryKey: qk.workspaces });
}

export function useGenerateScript(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { topic: string; prompt: string; language?: string }) =>
      api.generateScript(id, payload),
    onSuccess: (sv) => {
      qc.setQueryData(qk.script(id), sv);
      invalidateScript(qc, id);
    }
  });
}

export function useSaveScript(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { voiceoverScript?: string; scenes?: Scene[]; topic?: string; promptUsed?: string }) =>
      api.saveScript(id, data),
    onSuccess: (sv: ScriptVersion) => {
      qc.setQueryData(qk.script(id), sv);
      qc.invalidateQueries({ queryKey: qk.workspace(id) });
      qc.invalidateQueries({ queryKey: qk.workspaces });
    }
  });
}

export function useRestoreScript(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => api.restoreScript(id, version),
    onSuccess: (sv) => {
      qc.setQueryData(qk.script(id), sv);
      invalidateScript(qc, id);
    }
  });
}

// ── Audio ─────────────────────────────────────────────────────────────────────
export function useVoices() {
  return useQuery({ queryKey: qk.voices, queryFn: api.listVoices, staleTime: Infinity });
}

export function useAudio(id: string | undefined) {
  return useQuery({
    queryKey: qk.audio(id ?? ''),
    queryFn: () => api.getAudio(id!),
    enabled: !!id
  });
}

function invalidateAudio(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: qk.audio(id) });
  qc.invalidateQueries({ queryKey: qk.workspace(id) });
  qc.invalidateQueries({ queryKey: qk.workspaces });
  qc.invalidateQueries({ queryKey: qk.stats });
}

export function useGenerateAudio(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { voiceId: string; stability?: number; similarity?: number }) =>
      api.generateAudio(id, body),
    onSuccess: () => invalidateAudio(qc, id)
  });
}

export function useSelectAudio(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => api.selectAudio(id, version),
    onSuccess: () => invalidateAudio(qc, id)
  });
}

export function useDeleteAudio(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => api.deleteAudio(id, version),
    onSuccess: () => invalidateAudio(qc, id)
  });
}

export function useUploadAudio(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadAudio(id, file),
    onSuccess: () => invalidateAudio(qc, id)
  });
}

// ── Captions ──────────────────────────────────────────────────────────────────
export function useCaptions(id: string | undefined) {
  return useQuery({
    queryKey: qk.captions(id ?? ''),
    queryFn: () => api.getCaptions(id!),
    enabled: !!id
  });
}

export function useGenerateCaptions(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { language?: string; settings?: import('./types').CaptionSettings }) =>
      api.generateCaptions(id, body),
    onSuccess: (state) => {
      qc.setQueryData(qk.captions(id), state);
      qc.invalidateQueries({ queryKey: qk.captions(id) });
      qc.invalidateQueries({ queryKey: qk.workspace(id) });
      qc.invalidateQueries({ queryKey: qk.workspaces });
    }
  });
}

export function useSaveCaptions(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      settings: import('./types').CaptionSettings;
      lines: import('./types').CaptionLine[];
    }) => api.saveCaptions(id, body),
    // Update the cache without invalidating, so in-progress edits aren't reset.
    onSuccess: (state) => qc.setQueryData(qk.captions(id), state)
  });
}

export function useRenderCaptionOverlay(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (background: 'transparent' | 'greenscreen') =>
      api.renderCaptionOverlay(id, background),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.captions(id) })
  });
}

// ── Templates / Stats ────────────────────────────────────────────────────────
export function useTemplates() {
  return useQuery({ queryKey: qk.templates, queryFn: api.listTemplates });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, body }: { name: string; body: string }) =>
      api.createTemplate(name, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.templates })
  });
}

export function useStats() {
  return useQuery({ queryKey: qk.stats, queryFn: api.getStats });
}
