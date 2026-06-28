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
  ProjectAnalytics,
  AssetRef,
  AssetsState,
  AudioState,
  SceneJob,
  SceneJobs,
  LibraryItem,
  MediaItem,
  MediaKind,
  RenderRecord,
  RenderTimelinePayload,
  ScenePatch,
  SeoSuggestions,
  SoundItem,
  SoundPlacement,
  ElementItem,
  ElementPatch,
  ElementPlacement,
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
  ProjectSummary
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
  // projects
  listProjects: () => request<ProjectSummary[]>('/projects'),
  getProject: (id: string) => request<Manifest>(`/projects/${id}`),
  createProject: (name: string, language?: Language) =>
    request<Manifest>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, language })
    }),
  updateProject: (id: string, patch: { name?: string; language?: Language }) =>
    request<Manifest>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }),
  duplicateProject: (id: string) =>
    request<Manifest>(`/projects/${id}/duplicate`, { method: 'POST' }),
  deleteProject: (id: string) =>
    request<void>(`/projects/${id}`, { method: 'DELETE' }),

  // script
  getScript: (id: string) => request<ScriptVersion | null>(`/projects/${id}/script`),
  saveScript: (id: string, data: Partial<ScriptVersion>) =>
    request<ScriptVersion>(`/projects/${id}/script`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  generateScript: (
    id: string,
    payload: { topic: string; prompt: string; language?: string }
  ) =>
    request<ScriptVersion>(`/projects/${id}/script/generate`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  uploadScript: (
    id: string,
    payload: { voiceoverScript: string; topic?: string; language?: Language }
  ) =>
    request<ScriptVersion>(`/projects/${id}/script/upload`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listScriptVersions: (id: string) =>
    request<ScriptVersionMeta[]>(`/projects/${id}/script/versions`),
  restoreScript: (id: string, version: number) =>
    request<ScriptVersion>(`/projects/${id}/script/restore`, {
      method: 'POST',
      body: JSON.stringify({ version })
    }),

  // audio
  listVoices: () => request<Voice[]>('/voices'),
  getAudio: (id: string) => request<AudioState>(`/projects/${id}/audio`),
  generateAudio: (
    id: string,
    body: { voiceId: string; stability?: number; similarity?: number; speed?: number }
  ) =>
    request<AudioVersion>(`/projects/${id}/audio/generate`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  selectAudio: (id: string, version: number) =>
    request<Manifest>(`/projects/${id}/audio/select`, {
      method: 'POST',
      body: JSON.stringify({ version })
    }),
  deleteAudio: (id: string, version: number) =>
    request<Manifest>(`/projects/${id}/audio/${version}`, { method: 'DELETE' }),
  uploadAudio: async (id: string, file: File, speed = 1) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('speed', String(speed));
    const res = await fetch(`/api/projects/${id}/audio/upload`, {
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
  getCaptions: (id: string) => request<CaptionsState>(`/projects/${id}/caption`),
  generateCaptions: (
    id: string,
    body: { language?: string; settings?: CaptionSettings; force?: boolean }
  ) =>
    request<CaptionsState>(`/projects/${id}/caption/generate`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  saveCaptions: (id: string, body: { settings: CaptionSettings; lines: CaptionLine[] }) =>
    request<CaptionsState>(`/projects/${id}/caption`, {
      method: 'PUT',
      body: JSON.stringify(body)
    }),
  fixCaptions: (id: string) =>
    request<{ state: CaptionsState; method: 'align' | 'ai'; corrected: number }>(
      `/projects/${id}/caption/fix`,
      { method: 'POST' }
    ),
  renderCaptionOverlay: (id: string) =>
    request<CaptionOverlay>(`/projects/${id}/caption/render`, { method: 'POST' }),

  // media library
  getLibrary: (id: string) => request<LibraryItem[]>(`/projects/${id}/library`),
  uploadLibrary: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/projects/${id}/library`, { method: 'POST', body: fd });
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
    request<LibraryItem[]>(`/projects/${id}/library/${itemId}`, { method: 'DELETE' }),
  libraryFromGlobal: (id: string, itemId: string) =>
    request<LibraryItem>(`/projects/${id}/library/from-global`, {
      method: 'POST',
      body: JSON.stringify({ itemId })
    }),
  selectSceneFromLibrary: (id: string, sceneNumber: number, itemId: string) =>
    request<AssetsState>(`/projects/${id}/assets/${sceneNumber}/select-library`, {
      method: 'POST',
      body: JSON.stringify({ itemId })
    }),
  musicFromLibrary: (id: string, itemId: string) =>
    request<MusicTrack>(`/projects/${id}/video/music/from-library`, {
      method: 'POST',
      body: JSON.stringify({ itemId })
    }),
  musicFromGlobal: (id: string, itemId: string) =>
    request<MusicTrack>(`/projects/${id}/video/music/from-global`, {
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
  getVideoSounds: (id: string) => request<SoundPlacement[]>(`/projects/${id}/video/sounds`),
  placeSound: (id: string, soundId: string, atSec: number) =>
    request<SoundPlacement>(`/projects/${id}/video/sounds`, {
      method: 'POST',
      body: JSON.stringify({ soundId, atSec })
    }),
  updatePlacement: (id: string, placementId: string, patch: { atSec?: number; volume?: number }) =>
    request<SoundPlacement[]>(`/projects/${id}/video/sounds/${placementId}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    }),
  removePlacement: (id: string, placementId: string) =>
    request<SoundPlacement[]>(`/projects/${id}/video/sounds/${placementId}`, { method: 'DELETE' }),

  // global elements library (overlay images / gifs / videos)
  listElements: () => request<ElementItem[]>(`/elements`),
  uploadElement: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/elements`, { method: 'POST', body: fd });
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
    return res.json() as Promise<ElementItem>;
  },
  deleteElement: (id: string) => request<ElementItem[]>(`/elements/${id}`, { method: 'DELETE' }),
  renameElement: (id: string, name: string) =>
    request<ElementItem[]>(`/elements/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),

  // per-project element placements
  getProjectElements: (id: string) => request<ElementPlacement[]>(`/projects/${id}/video/elements`),
  placeElement: (id: string, elementId: string, layer: number, atSec: number) =>
    request<ElementPlacement>(`/projects/${id}/video/elements`, {
      method: 'POST',
      body: JSON.stringify({ elementId, layer, atSec })
    }),
  // Upload a project-specific file straight onto the timeline (no global library).
  uploadElementToProject: async (id: string, file: File, layer: number, atSec: number) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('layer', String(layer));
    fd.append('atSec', String(atSec));
    const res = await fetch(`/api/projects/${id}/video/elements/upload`, { method: 'POST', body: fd });
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
    return res.json() as Promise<ElementPlacement>;
  },
  // Turn an existing project Asset Library item into a timeline element.
  placeElementFromLibrary: (id: string, itemId: string, layer: number, atSec: number) =>
    request<ElementPlacement>(`/projects/${id}/video/elements/from-library`, {
      method: 'POST',
      body: JSON.stringify({ itemId, layer, atSec })
    }),
  // Add a text overlay element onto the timeline.
  createTextElement: (
    id: string,
    body: { layer: number; atSec: number; text?: string; durationSec?: number }
  ) =>
    request<ElementPlacement>(`/projects/${id}/video/elements/text`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  updateElement: (id: string, placementId: string, patch: ElementPatch) =>
    request<ElementPlacement[]>(`/projects/${id}/video/elements/${placementId}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    }),
  removeElement: (id: string, placementId: string) =>
    request<ElementPlacement[]>(`/projects/${id}/video/elements/${placementId}`, { method: 'DELETE' }),
  // global elements — background removal (chroma key)
  elementBgPreview: (elementId: string, params: import('./types').BgParams) =>
    request<{ file: string }>(`/elements/${elementId}/bg-preview`, {
      method: 'POST',
      body: JSON.stringify(params)
    }),
  elementBgApply: (elementId: string, params: import('./types').BgParams) =>
    request<ElementItem>(`/elements/${elementId}/bg-apply`, {
      method: 'POST',
      body: JSON.stringify(params)
    }),
  addElementLayer: (id: string) =>
    request<{ elementLayers: number }>(`/projects/${id}/video/elements/layers`, { method: 'POST' }),
  removeElementLayer: (id: string, layer: number) =>
    request<{ elements: ElementPlacement[]; elementLayers: number }>(
      `/projects/${id}/video/elements/layers/${layer}`,
      { method: 'DELETE' }
    ),

  // scenes (canonical breakdown)
  getScenes: (id: string) => request<Scene[]>(`/projects/${id}/scenes`),
  // Starts the breakdown as a background job (poll getSceneJobs for completion).
  startBreakdown: (id: string) =>
    request<SceneJob>(`/projects/${id}/scenes/breakdown`, { method: 'POST' }),
  getSceneJobs: (id: string) => request<SceneJobs>(`/projects/${id}/scenes/jobs`),
  updateScene: (id: string, sceneNumber: number, patch: ScenePatch) =>
    request<Scene[]>(`/projects/${id}/scenes/${sceneNumber}`, {
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
    request<{ scenes: Scene[]; assets: AssetsState }>(`/projects/${id}/scenes/from-media`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  removeScene: (id: string, sceneNumber: number) =>
    request<Scene[]>(`/projects/${id}/scenes/${sceneNumber}`, { method: 'DELETE' }),
  trimSceneAsset: (id: string, sceneNumber: number, trimStartSec: number, trimEndSec: number) =>
    request<AssetsState>(`/projects/${id}/assets/${sceneNumber}/trim`, {
      method: 'PUT',
      body: JSON.stringify({ trimStartSec, trimEndSec })
    }),

  // assets
  getAssets: (id: string) => request<AssetsState>(`/projects/${id}/assets`),
  searchSceneAssets: (id: string, sceneNumber: number, keywords: string[]) =>
    request<AssetsState>(`/projects/${id}/assets/${sceneNumber}/search`, {
      method: 'POST',
      body: JSON.stringify({ keywords })
    }),
  selectSceneAsset: (id: string, sceneNumber: number, ref: AssetRef) =>
    request<AssetsState>(`/projects/${id}/assets/${sceneNumber}/select`, {
      method: 'POST',
      body: JSON.stringify({ ref })
    }),
  clearSceneAsset: (id: string, sceneNumber: number) =>
    request<AssetsState>(`/projects/${id}/assets/${sceneNumber}/select`, {
      method: 'DELETE'
    }),
  saveSceneMeta: (
    id: string,
    sceneNumber: number,
    body: { keywords: string[]; imagePrompt: string }
  ) =>
    request<AssetsState>(`/projects/${id}/assets/${sceneNumber}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    }),
  // Starts auto-fill as a background job (poll getSceneJobs; watch getAssets fill in).
  startAutofill: (id: string) =>
    request<SceneJob>(`/projects/${id}/assets/autofill`, { method: 'POST' }),
  uploadSceneAsset: async (id: string, sceneNumber: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/projects/${id}/assets/${sceneNumber}/upload`, {
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
  getRenders: (id: string) => request<RenderRecord[]>(`/projects/${id}/video`),
  getRenderStatus: (id: string, rid: string) =>
    request<RenderRecord>(`/projects/${id}/video/${rid}`),
  renderVideo: (id: string, timeline: RenderTimelinePayload) =>
    request<RenderRecord>(`/projects/${id}/video`, {
      method: 'POST',
      body: JSON.stringify({ timeline })
    }),
  deleteRender: (id: string, rid: string) =>
    request<Manifest>(`/projects/${id}/video/${rid}`, { method: 'DELETE' }),
  uploadMusic: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/projects/${id}/video/music`, { method: 'POST', body: fd });
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
    request<MusicTrack>(`/projects/${id}/video/music`, { method: 'DELETE' }),

  // upload metadata + SEO
  getUpload: (id: string) => request<UploadMeta>(`/projects/${id}/upload`),
  saveUpload: (id: string, patch: Partial<UploadMeta>) =>
    request<UploadMeta>(`/projects/${id}/upload`, { method: 'PUT', body: JSON.stringify(patch) }),
  generateSeo: (id: string) =>
    request<SeoSuggestions>(`/projects/${id}/upload/seo`, { method: 'POST' }),
  getYoutubeStatus: (id: string) => request<YoutubeStatus>(`/projects/${id}/upload/youtube`),
  publishYoutube: (id: string) =>
    request<YoutubeState>(`/projects/${id}/upload/publish`, { method: 'POST' }),

  // thumbnail
  uploadThumbnail: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/projects/${id}/upload/thumbnail`, { method: 'POST', body: fd });
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
    request<UploadMeta>(`/projects/${id}/upload/thumbnail/from-asset`, {
      method: 'POST',
      body: JSON.stringify({ source, itemId })
    }),
  thumbnailFromFrame: (id: string, atSec?: number) =>
    request<UploadMeta>(`/projects/${id}/upload/thumbnail/from-frame`, {
      method: 'POST',
      body: JSON.stringify(atSec == null ? {} : { atSec })
    }),
  removeThumbnail: (id: string) =>
    request<UploadMeta>(`/projects/${id}/upload/thumbnail`, { method: 'DELETE' }),
  generateThumbnail: (id: string, prompt: string) =>
    request<UploadMeta>(`/projects/${id}/upload/thumbnail/generate`, {
      method: 'POST',
      body: JSON.stringify({ prompt })
    }),

  // AI image generation
  imageGenStatus: () => request<ImageGenStatus>(`/ai/image-status`),
  generateLibraryImage: (id: string, prompt: string) =>
    request<LibraryItem>(`/projects/${id}/library/generate`, {
      method: 'POST',
      body: JSON.stringify({ prompt })
    }),
  generateSceneImage: (id: string, scene: number, prompt: string) =>
    request<{ item: LibraryItem; assets: AssetsState }>(`/projects/${id}/assets/${scene}/generate`, {
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
  projectAnalytics: (id: string) =>
    request<WithReauth<ProjectAnalytics>>(`/projects/${id}/analytics`),

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
