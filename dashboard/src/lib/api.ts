import type {
  AssetRef,
  AssetsState,
  AudioState,
  BreakdownResult,
  LibraryItem,
  RenderRecord,
  RenderTimelinePayload,
  ScenePatch,
  SeoSuggestions,
  UploadMeta,
  YoutubeState,
  YoutubeStatus,
  AudioVersion,
  CaptionLine,
  CaptionOverlay,
  CaptionSettings,
  CaptionsState,
  Language,
  Manifest,
  MusicTrack,
  PromptTemplate,
  Scene,
  ScriptVersion,
  ScriptVersionMeta,
  Stats,
  Voice,
  WorkspaceSummary
} from './types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // workspaces
  listWorkspaces: () => request<WorkspaceSummary[]>('/workspaces'),
  getWorkspace: (id: string) => request<Manifest>(`/workspaces/${id}`),
  createWorkspace: (name: string, language?: Language) =>
    request<Manifest>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, language })
    }),
  updateWorkspace: (id: string, patch: { name?: string; language?: Language }) =>
    request<Manifest>(`/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }),
  duplicateWorkspace: (id: string) =>
    request<Manifest>(`/workspaces/${id}/duplicate`, { method: 'POST' }),
  deleteWorkspace: (id: string) =>
    request<void>(`/workspaces/${id}`, { method: 'DELETE' }),

  // script
  getScript: (id: string) => request<ScriptVersion | null>(`/workspaces/${id}/script`),
  saveScript: (id: string, data: Partial<ScriptVersion>) =>
    request<ScriptVersion>(`/workspaces/${id}/script`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  generateScript: (
    id: string,
    payload: { topic: string; prompt: string; language?: string }
  ) =>
    request<ScriptVersion>(`/workspaces/${id}/script/generate`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listScriptVersions: (id: string) =>
    request<ScriptVersionMeta[]>(`/workspaces/${id}/script/versions`),
  restoreScript: (id: string, version: number) =>
    request<ScriptVersion>(`/workspaces/${id}/script/restore`, {
      method: 'POST',
      body: JSON.stringify({ version })
    }),

  // audio
  listVoices: () => request<Voice[]>('/voices'),
  getAudio: (id: string) => request<AudioState>(`/workspaces/${id}/audio`),
  generateAudio: (
    id: string,
    body: { voiceId: string; stability?: number; similarity?: number; speed?: number }
  ) =>
    request<AudioVersion>(`/workspaces/${id}/audio/generate`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  selectAudio: (id: string, version: number) =>
    request<Manifest>(`/workspaces/${id}/audio/select`, {
      method: 'POST',
      body: JSON.stringify({ version })
    }),
  deleteAudio: (id: string, version: number) =>
    request<Manifest>(`/workspaces/${id}/audio/${version}`, { method: 'DELETE' }),
  uploadAudio: async (id: string, file: File, speed = 1) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('speed', String(speed));
    const res = await fetch(`/api/workspaces/${id}/audio/upload`, {
      method: 'POST',
      body: fd
    });
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const b = await res.json();
        if (b?.error) msg = b.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return res.json() as Promise<AudioVersion>;
  },

  // captions
  getCaptions: (id: string) => request<CaptionsState>(`/workspaces/${id}/caption`),
  generateCaptions: (
    id: string,
    body: { language?: string; settings?: CaptionSettings }
  ) =>
    request<CaptionsState>(`/workspaces/${id}/caption/generate`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  saveCaptions: (id: string, body: { settings: CaptionSettings; lines: CaptionLine[] }) =>
    request<CaptionsState>(`/workspaces/${id}/caption`, {
      method: 'PUT',
      body: JSON.stringify(body)
    }),
  renderCaptionOverlay: (id: string) =>
    request<CaptionOverlay>(`/workspaces/${id}/caption/render`, { method: 'POST' }),

  // media library
  getLibrary: (id: string) => request<LibraryItem[]>(`/workspaces/${id}/library`),
  uploadLibrary: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/workspaces/${id}/library`, { method: 'POST', body: fd });
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const b = await res.json();
        if (b?.error) msg = b.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return res.json() as Promise<LibraryItem>;
  },
  deleteLibrary: (id: string, itemId: string) =>
    request<LibraryItem[]>(`/workspaces/${id}/library/${itemId}`, { method: 'DELETE' }),
  selectSceneFromLibrary: (id: string, sceneNumber: number, itemId: string) =>
    request<AssetsState>(`/workspaces/${id}/assets/${sceneNumber}/select-library`, {
      method: 'POST',
      body: JSON.stringify({ itemId })
    }),
  musicFromLibrary: (id: string, itemId: string) =>
    request<MusicTrack>(`/workspaces/${id}/video/music/from-library`, {
      method: 'POST',
      body: JSON.stringify({ itemId })
    }),

  // scenes (canonical breakdown)
  getScenes: (id: string) => request<Scene[]>(`/workspaces/${id}/scenes`),
  buildBreakdown: (id: string) =>
    request<BreakdownResult>(`/workspaces/${id}/scenes/breakdown`, { method: 'POST' }),
  updateScene: (id: string, sceneNumber: number, patch: ScenePatch) =>
    request<Scene[]>(`/workspaces/${id}/scenes/${sceneNumber}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    }),

  // assets
  getAssets: (id: string) => request<AssetsState>(`/workspaces/${id}/assets`),
  searchSceneAssets: (id: string, sceneNumber: number, keywords: string[]) =>
    request<AssetsState>(`/workspaces/${id}/assets/${sceneNumber}/search`, {
      method: 'POST',
      body: JSON.stringify({ keywords })
    }),
  selectSceneAsset: (id: string, sceneNumber: number, ref: AssetRef) =>
    request<AssetsState>(`/workspaces/${id}/assets/${sceneNumber}/select`, {
      method: 'POST',
      body: JSON.stringify({ ref })
    }),
  clearSceneAsset: (id: string, sceneNumber: number) =>
    request<AssetsState>(`/workspaces/${id}/assets/${sceneNumber}/select`, {
      method: 'DELETE'
    }),
  saveSceneMeta: (
    id: string,
    sceneNumber: number,
    body: { keywords: string[]; imagePrompt: string }
  ) =>
    request<AssetsState>(`/workspaces/${id}/assets/${sceneNumber}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    }),
  autofillAssets: (id: string) =>
    request<AssetsState>(`/workspaces/${id}/assets/autofill`, { method: 'POST' }),
  uploadSceneAsset: async (id: string, sceneNumber: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/workspaces/${id}/assets/${sceneNumber}/upload`, {
      method: 'POST',
      body: fd
    });
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const b = await res.json();
        if (b?.error) msg = b.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return res.json() as Promise<AssetsState>;
  },

  // video renders
  getRenders: (id: string) => request<RenderRecord[]>(`/workspaces/${id}/video`),
  getRenderStatus: (id: string, rid: string) =>
    request<RenderRecord>(`/workspaces/${id}/video/${rid}`),
  renderVideo: (id: string, timeline: RenderTimelinePayload) =>
    request<RenderRecord>(`/workspaces/${id}/video`, {
      method: 'POST',
      body: JSON.stringify({ timeline })
    }),
  deleteRender: (id: string, rid: string) =>
    request<Manifest>(`/workspaces/${id}/video/${rid}`, { method: 'DELETE' }),
  uploadMusic: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/workspaces/${id}/video/music`, { method: 'POST', body: fd });
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const b = await res.json();
        if (b?.error) msg = b.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return res.json() as Promise<MusicTrack>;
  },
  deleteMusic: (id: string) =>
    request<MusicTrack>(`/workspaces/${id}/video/music`, { method: 'DELETE' }),

  // upload metadata + SEO
  getUpload: (id: string) => request<UploadMeta>(`/workspaces/${id}/upload`),
  saveUpload: (id: string, patch: Partial<UploadMeta>) =>
    request<UploadMeta>(`/workspaces/${id}/upload`, { method: 'PUT', body: JSON.stringify(patch) }),
  generateSeo: (id: string) =>
    request<SeoSuggestions>(`/workspaces/${id}/upload/seo`, { method: 'POST' }),
  getYoutubeStatus: (id: string) => request<YoutubeStatus>(`/workspaces/${id}/upload/youtube`),
  publishYoutube: (id: string) =>
    request<YoutubeState>(`/workspaces/${id}/upload/publish`, { method: 'POST' }),

  // templates
  listTemplates: () => request<PromptTemplate[]>('/prompt-templates'),
  createTemplate: (name: string, body: string) =>
    request<PromptTemplate>('/prompt-templates', {
      method: 'POST',
      body: JSON.stringify({ name, body })
    }),
  updateTemplate: (id: string, patch: { name?: string; body?: string }) =>
    request<PromptTemplate>(`/prompt-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    }),
  deleteTemplate: (id: string) =>
    request<void>(`/prompt-templates/${id}`, { method: 'DELETE' }),

  // stats
  getStats: () => request<Stats>('/stats')
};

export type { Scene };
