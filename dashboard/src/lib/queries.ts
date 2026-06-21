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
  scenes: (id: string) => ['scenes', id] as const,
  assets: (id: string) => ['assets', id] as const,
  renders: (id: string) => ['renders', id] as const,
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
    mutationFn: (body: { voiceId: string; stability?: number; similarity?: number; speed?: number }) =>
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
    mutationFn: ({ file, speed }: { file: File; speed?: number }) =>
      api.uploadAudio(id, file, speed),
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
    mutationFn: () => api.renderCaptionOverlay(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.captions(id) })
  });
}

// ── Media library ─────────────────────────────────────────────────────────────
export function useLibrary(id: string | undefined) {
  return useQuery({
    queryKey: ['library', id ?? ''] as const,
    queryFn: () => api.getLibrary(id!),
    enabled: !!id
  });
}

export function useUploadLibrary(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadLibrary(id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library', id] })
  });
}

export function useDeleteLibrary(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.deleteLibrary(id, itemId),
    onSuccess: (items) => qc.setQueryData(['library', id], items)
  });
}

export function useSelectSceneFromLibrary(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sceneNumber, itemId }: { sceneNumber: number; itemId: string }) =>
      api.selectSceneFromLibrary(id, sceneNumber, itemId),
    onSuccess: (state) => {
      qc.setQueryData(qk.assets(id), state);
      qc.invalidateQueries({ queryKey: qk.assets(id) });
      qc.invalidateQueries({ queryKey: qk.workspace(id) });
      qc.invalidateQueries({ queryKey: qk.workspaces });
    }
  });
}

export function useMusicFromLibrary(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.musicFromLibrary(id, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workspace(id) })
  });
}

// ── Scenes (canonical breakdown) ──────────────────────────────────────────────
export function useScenes(id: string | undefined) {
  return useQuery({
    queryKey: qk.scenes(id ?? ''),
    queryFn: () => api.getScenes(id!),
    enabled: !!id
  });
}

export function useBuildBreakdown(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.buildBreakdown(id),
    onSuccess: (r) => {
      qc.setQueryData(qk.scenes(id), r.scenes);
      qc.invalidateQueries({ queryKey: qk.scenes(id) });
      qc.invalidateQueries({ queryKey: qk.assets(id) });
      qc.invalidateQueries({ queryKey: qk.workspace(id) });
      qc.invalidateQueries({ queryKey: qk.workspaces });
    }
  });
}

export function useUpdateScene(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sceneNumber, patch }: { sceneNumber: number; patch: import('./types').ScenePatch }) =>
      api.updateScene(id, sceneNumber, patch),
    // Update the cache in place so edits don't refetch/clobber in-progress typing.
    onSuccess: (scenes) => qc.setQueryData(qk.scenes(id), scenes)
  });
}

// ── Assets ──────────────────────────────────────────────────────────────────────
export function useAssets(id: string | undefined) {
  return useQuery({
    queryKey: qk.assets(id ?? ''),
    queryFn: () => api.getAssets(id!),
    enabled: !!id
  });
}

function invalidateAssets(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: qk.assets(id) });
  qc.invalidateQueries({ queryKey: qk.workspace(id) });
  qc.invalidateQueries({ queryKey: qk.workspaces });
  qc.invalidateQueries({ queryKey: qk.stats });
}

export function useSearchSceneAssets(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sceneNumber, keywords }: { sceneNumber: number; keywords: string[] }) =>
      api.searchSceneAssets(id, sceneNumber, keywords),
    // Search only refreshes candidates — update the cache without invalidating so
    // it doesn't refetch and clobber in-flight edits.
    onSuccess: (state) => qc.setQueryData(qk.assets(id), state)
  });
}

export function useSelectSceneAsset(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sceneNumber, ref }: { sceneNumber: number; ref: import('./types').AssetRef }) =>
      api.selectSceneAsset(id, sceneNumber, ref),
    onSuccess: (state) => {
      qc.setQueryData(qk.assets(id), state);
      invalidateAssets(qc, id);
    }
  });
}

export function useClearSceneAsset(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sceneNumber: number) => api.clearSceneAsset(id, sceneNumber),
    onSuccess: (state) => {
      qc.setQueryData(qk.assets(id), state);
      invalidateAssets(qc, id);
    }
  });
}

export function useSaveSceneMeta(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { sceneNumber: number; keywords: string[]; imagePrompt: string }) =>
      api.saveSceneMeta(id, body.sceneNumber, { keywords: body.keywords, imagePrompt: body.imagePrompt }),
    onSuccess: (state) => qc.setQueryData(qk.assets(id), state)
  });
}

export function useUploadSceneAsset(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sceneNumber, file }: { sceneNumber: number; file: File }) =>
      api.uploadSceneAsset(id, sceneNumber, file),
    onSuccess: (state) => {
      qc.setQueryData(qk.assets(id), state);
      invalidateAssets(qc, id);
    }
  });
}

export function useAutofillAssets(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.autofillAssets(id),
    onSuccess: (state) => {
      qc.setQueryData(qk.assets(id), state);
      invalidateAssets(qc, id);
    }
  });
}

// ── Video renders ─────────────────────────────────────────────────────────────
export function useRenders(id: string | undefined) {
  return useQuery({
    queryKey: qk.renders(id ?? ''),
    queryFn: () => api.getRenders(id!),
    enabled: !!id,
    // Poll while a render is in progress; stop once everything has settled.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r) => r.status === 'rendering') ? 1500 : false
  });
}

function invalidateRenders(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: qk.renders(id) });
  qc.invalidateQueries({ queryKey: qk.workspace(id) });
  qc.invalidateQueries({ queryKey: qk.workspaces });
  qc.invalidateQueries({ queryKey: qk.stats });
}

export function useRenderVideo(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (timeline: import('./types').RenderTimelinePayload) =>
      api.renderVideo(id, timeline),
    onSuccess: () => invalidateRenders(qc, id)
  });
}

export function useDeleteRender(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rid: string) => api.deleteRender(id, rid),
    onSuccess: () => invalidateRenders(qc, id)
  });
}

export function useUploadMusic(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadMusic(id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workspace(id) })
  });
}

export function useDeleteMusic(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteMusic(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workspace(id) })
  });
}

// ── Upload metadata + SEO ─────────────────────────────────────────────────────
export function useUpload(id: string | undefined) {
  return useQuery({
    queryKey: ['upload', id ?? ''] as const,
    queryFn: () => api.getUpload(id!),
    enabled: !!id
  });
}

export function useSaveUpload(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<import('./types').UploadMeta>) => api.saveUpload(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workspace(id) });
      qc.invalidateQueries({ queryKey: qk.workspaces });
    }
  });
}

export function useGenerateSeo(id: string) {
  return useMutation({ mutationFn: () => api.generateSeo(id) });
}

export function useYoutubeStatus(id: string | undefined) {
  return useQuery({
    queryKey: ['youtube', id ?? ''] as const,
    queryFn: () => api.getYoutubeStatus(id!),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === 'uploading' ? 1500 : false)
  });
}

export function usePublishYoutube(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.publishYoutube(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['youtube', id] });
      qc.invalidateQueries({ queryKey: qk.workspace(id) });
      qc.invalidateQueries({ queryKey: qk.workspaces });
      qc.invalidateQueries({ queryKey: qk.stats });
    }
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
