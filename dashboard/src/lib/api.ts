import type {
  AudioState,
  AudioVersion,
  CaptionLine,
  CaptionOverlay,
  CaptionSettings,
  CaptionsState,
  Language,
  Manifest,
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
    body: { voiceId: string; stability?: number; similarity?: number }
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
  uploadAudio: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
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
