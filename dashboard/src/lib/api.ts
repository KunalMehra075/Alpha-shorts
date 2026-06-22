import type {
  AnalyticsOverview,
  AnalyticsRange,
  AnalyticsStatus,
  AnalyticsSeriesPoint,
  ImageGenStatus,
  OauthResult,
  TopVideos,
  VideoAnalyticsRow,
  WithReauth,
  WorkspaceAnalytics,
  AssetRef,
  AssetsState,
  AudioState,
  BreakdownResult,
  LibraryItem,
  MediaItem,
  MediaKind,
  RenderRecord,
  RenderTimelinePayload,
  ScenePatch,
  SeoSuggestions,
  SoundItem,
  SoundPlacement,
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
  libraryFromGlobal: (id: string, itemId: string) =>
    request<LibraryItem>(`/workspaces/${id}/library/from-global`, {
      method: 'POST',
      body: JSON.stringify({ itemId })
    }),
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
  musicFromGlobal: (id: string, itemId: string) =>
    request<MusicTrack>(`/workspaces/${id}/video/music/from-global`, {
      method: 'POST',
      body: JSON.stringify({ itemId })
    }),

  // global sound library
  listSounds: () => request<SoundItem[]>(`/sounds`),
  uploadSound: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/sounds`, { method: 'POST', body: fd });
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
    return res.json() as Promise<SoundItem>;
  },
  deleteSound: (soundId: string) => request<SoundItem[]>(`/sounds/${soundId}`, { method: 'DELETE' }),

  // global media library (images / videos / music)
  listMedia: (kind?: MediaKind) =>
    request<MediaItem[]>(`/media-library${kind ? `?kind=${kind}` : ''}`),
  uploadMedia: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/media-library`, { method: 'POST', body: fd });
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
    return res.json() as Promise<MediaItem>;
  },
  deleteMedia: (id: string) => request<MediaItem[]>(`/media-library/${id}`, { method: 'DELETE' }),

  // per-video sound placements
  getVideoSounds: (id: string) => request<SoundPlacement[]>(`/workspaces/${id}/video/sounds`),
  placeSound: (id: string, soundId: string, atSec: number) =>
    request<SoundPlacement>(`/workspaces/${id}/video/sounds`, {
      method: 'POST',
      body: JSON.stringify({ soundId, atSec })
    }),
  updatePlacement: (id: string, placementId: string, patch: { atSec?: number; volume?: number }) =>
    request<SoundPlacement[]>(`/workspaces/${id}/video/sounds/${placementId}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    }),
  removePlacement: (id: string, placementId: string) =>
    request<SoundPlacement[]>(`/workspaces/${id}/video/sounds/${placementId}`, { method: 'DELETE' }),

  // scenes (canonical breakdown)
  getScenes: (id: string) => request<Scene[]>(`/workspaces/${id}/scenes`),
  buildBreakdown: (id: string) =>
    request<BreakdownResult>(`/workspaces/${id}/scenes/breakdown`, { method: 'POST' }),
  updateScene: (id: string, sceneNumber: number, patch: ScenePatch) =>
    request<Scene[]>(`/workspaces/${id}/scenes/${sceneNumber}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    }),
  addSceneFromMedia: (
    id: string,
    payload: {
      source: 'library' | 'global';
      itemId: string;
      durationSec?: number;
      trimStartSec?: number;
      trimEndSec?: number;
    }
  ) =>
    request<{ scenes: Scene[]; assets: AssetsState }>(`/workspaces/${id}/scenes/from-media`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  removeScene: (id: string, sceneNumber: number) =>
    request<Scene[]>(`/workspaces/${id}/scenes/${sceneNumber}`, { method: 'DELETE' }),
  trimSceneAsset: (id: string, sceneNumber: number, trimStartSec: number, trimEndSec: number) =>
    request<AssetsState>(`/workspaces/${id}/assets/${sceneNumber}/trim`, {
      method: 'PUT',
      body: JSON.stringify({ trimStartSec, trimEndSec })
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

  // thumbnail
  uploadThumbnail: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/workspaces/${id}/upload/thumbnail`, { method: 'POST', body: fd });
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
    return res.json() as Promise<UploadMeta>;
  },
  thumbnailFromAsset: (id: string, source: 'library' | 'global', itemId: string) =>
    request<UploadMeta>(`/workspaces/${id}/upload/thumbnail/from-asset`, {
      method: 'POST',
      body: JSON.stringify({ source, itemId })
    }),
  thumbnailFromFrame: (id: string, atSec?: number) =>
    request<UploadMeta>(`/workspaces/${id}/upload/thumbnail/from-frame`, {
      method: 'POST',
      body: JSON.stringify(atSec == null ? {} : { atSec })
    }),
  removeThumbnail: (id: string) =>
    request<UploadMeta>(`/workspaces/${id}/upload/thumbnail`, { method: 'DELETE' }),
  generateThumbnail: (id: string, prompt: string) =>
    request<UploadMeta>(`/workspaces/${id}/upload/thumbnail/generate`, {
      method: 'POST',
      body: JSON.stringify({ prompt })
    }),

  // AI image generation
  imageGenStatus: () => request<ImageGenStatus>(`/ai/image-status`),
  generateLibraryImage: (id: string, prompt: string) =>
    request<LibraryItem>(`/workspaces/${id}/library/generate`, {
      method: 'POST',
      body: JSON.stringify({ prompt })
    }),
  generateSceneImage: (id: string, scene: number, prompt: string) =>
    request<{ item: LibraryItem; assets: AssetsState }>(`/workspaces/${id}/assets/${scene}/generate`, {
      method: 'POST',
      body: JSON.stringify({ prompt })
    }),

  // analytics
  analyticsStatus: () => request<AnalyticsStatus>(`/analytics/status`),
  analyticsOverview: (range: AnalyticsRange) =>
    request<WithReauth<AnalyticsOverview>>(`/analytics/overview?range=${range}`),
  analyticsTimeseries: (range: AnalyticsRange) =>
    request<WithReauth<{ range: AnalyticsRange; fetchedAt: string; series: AnalyticsSeriesPoint[] }>>(
      `/analytics/timeseries?range=${range}`
    ),
  analyticsVideos: (range: AnalyticsRange, sort?: string, search?: string) => {
    const qs = new URLSearchParams({ range });
    if (sort) qs.set('sort', sort);
    if (search) qs.set('search', search);
    return request<WithReauth<{ range: AnalyticsRange; fetchedAt: string; videos: VideoAnalyticsRow[] }>>(
      `/analytics/videos?${qs.toString()}`
    );
  },
  analyticsTop: (range: AnalyticsRange) =>
    request<WithReauth<TopVideos>>(`/analytics/top?range=${range}`),
  analyticsRefresh: () => request<{ ok: boolean }>(`/analytics/refresh`, { method: 'POST' }),
  analyticsOauthResult: () => request<OauthResult>(`/analytics/oauth/result`),
  workspaceAnalytics: (id: string) =>
    request<WithReauth<WorkspaceAnalytics>>(`/workspaces/${id}/analytics`),

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
