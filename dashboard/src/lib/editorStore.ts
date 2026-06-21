import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Scene } from './types';
import type { StockAsset } from './mockMedia';
import {
  PRESETS,
  defaultEffect,
  presetEffect,
  randomTransition,
  type Transition
} from './editorOptions';

// ── Shapes ───────────────────────────────────────────────────────────────────
export type SceneAsset = {
  selected: StockAsset | null;
  keywords: string[];
  imagePrompt: string;
  seed: number;
};

export type TimelineScene = {
  effect: string;
  transition: Transition;
  durationSec: number;
};

export type MusicSettings = {
  enabled: boolean;
  name: string;
  volume: number; // 0-100
  fadeIn: boolean;
  fadeOut: boolean;
};

export type WorkspaceEditor = {
  assets: Record<number, SceneAsset>;
  timeline: {
    scenes: Record<number, TimelineScene>;
    preset: string | null;
    music: MusicSettings;
    captionsEnabled: boolean;
  };
};

const emptyMusic = (): MusicSettings => ({
  enabled: false,
  name: '',
  volume: 30,
  fadeIn: true,
  fadeOut: true
});

const emptyEditor = (): WorkspaceEditor => ({
  assets: {},
  timeline: { scenes: {}, preset: null, music: emptyMusic(), captionsEnabled: true }
});

// Stable reference for the "no data yet" case, so selectors don't loop in React.
const EMPTY_EDITOR: WorkspaceEditor = emptyEditor();

type EditorState = {
  byWorkspace: Record<string, WorkspaceEditor>;

  ensureAssets: (id: string, scenes: Scene[]) => void;
  setAsset: (id: string, i: number, asset: StockAsset | null) => void;
  setKeywords: (id: string, i: number, keywords: string[]) => void;
  setImagePrompt: (id: string, i: number, prompt: string) => void;
  bumpSeed: (id: string, i: number) => void;

  ensureTimeline: (id: string, scenes: Scene[]) => void;
  setSceneEffect: (id: string, i: number, effect: string) => void;
  setSceneTransition: (id: string, i: number, transition: Transition) => void;
  setSceneDuration: (id: string, i: number, durationSec: number) => void;
  applyPreset: (id: string, presetName: string, scenes: Scene[]) => void;
  setMusic: (id: string, patch: Partial<MusicSettings>) => void;
  toggleCaptions: (id: string, enabled: boolean) => void;
};

// Immutably update a workspace's editor slice, creating it if missing.
function withWs(
  state: EditorState,
  id: string,
  fn: (ws: WorkspaceEditor) => WorkspaceEditor
): Pick<EditorState, 'byWorkspace'> {
  const current = state.byWorkspace[id] ?? emptyEditor();
  return { byWorkspace: { ...state.byWorkspace, [id]: fn(current) } };
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      byWorkspace: {},

      ensureAssets: (id, scenes) =>
        set((s) =>
          withWs(s, id, (ws) => {
            const assets = { ...ws.assets };
            scenes.forEach((sc, i) => {
              if (!assets[i]) {
                assets[i] = {
                  selected: null,
                  keywords: sc.searchKeywords ?? [],
                  imagePrompt: sc.imagePrompt ?? '',
                  seed: 0
                };
              }
            });
            return { ...ws, assets };
          })
        ),

      setAsset: (id, i, asset) =>
        set((s) =>
          withWs(s, id, (ws) => ({
            ...ws,
            assets: { ...ws.assets, [i]: { ...ws.assets[i], selected: asset } }
          }))
        ),

      setKeywords: (id, i, keywords) =>
        set((s) =>
          withWs(s, id, (ws) => ({
            ...ws,
            assets: { ...ws.assets, [i]: { ...ws.assets[i], keywords } }
          }))
        ),

      setImagePrompt: (id, i, prompt) =>
        set((s) =>
          withWs(s, id, (ws) => ({
            ...ws,
            assets: { ...ws.assets, [i]: { ...ws.assets[i], imagePrompt: prompt } }
          }))
        ),

      bumpSeed: (id, i) =>
        set((s) =>
          withWs(s, id, (ws) => ({
            ...ws,
            assets: { ...ws.assets, [i]: { ...ws.assets[i], seed: (ws.assets[i]?.seed ?? 0) + 1 } }
          }))
        ),

      ensureTimeline: (id, scenes) =>
        set((s) =>
          withWs(s, id, (ws) => {
            const assets = { ...ws.assets };
            const tScenes = { ...ws.timeline.scenes };
            scenes.forEach((sc, i) => {
              if (!assets[i]) {
                assets[i] = {
                  selected: null,
                  keywords: sc.searchKeywords ?? [],
                  imagePrompt: sc.imagePrompt ?? '',
                  seed: 0
                };
              }
              if (!tScenes[i]) {
                // "Looks good immediately": default effect + a random transition.
                tScenes[i] = {
                  effect: defaultEffect(sc.visualType),
                  transition: randomTransition(`${id}:${i}`),
                  durationSec: Math.max(0.5, sc.end - sc.start)
                };
              }
            });
            return { ...ws, assets, timeline: { ...ws.timeline, scenes: tScenes } };
          })
        ),

      setSceneEffect: (id, i, effect) =>
        set((s) =>
          withWs(s, id, (ws) => ({
            ...ws,
            timeline: {
              ...ws.timeline,
              scenes: { ...ws.timeline.scenes, [i]: { ...ws.timeline.scenes[i], effect } }
            }
          }))
        ),

      setSceneTransition: (id, i, transition) =>
        set((s) =>
          withWs(s, id, (ws) => ({
            ...ws,
            timeline: {
              ...ws.timeline,
              scenes: { ...ws.timeline.scenes, [i]: { ...ws.timeline.scenes[i], transition } }
            }
          }))
        ),

      setSceneDuration: (id, i, durationSec) =>
        set((s) =>
          withWs(s, id, (ws) => ({
            ...ws,
            timeline: {
              ...ws.timeline,
              scenes: {
                ...ws.timeline.scenes,
                [i]: { ...ws.timeline.scenes[i], durationSec: Math.max(0.5, durationSec) }
              }
            }
          }))
        ),

      applyPreset: (id, presetName, scenes) =>
        set((s) =>
          withWs(s, id, (ws) => {
            const preset = PRESETS.find((p) => p.name === presetName);
            if (!preset) return ws;
            const tScenes = { ...ws.timeline.scenes };
            scenes.forEach((sc, i) => {
              tScenes[i] = {
                effect: presetEffect(preset, sc.visualType),
                transition: preset.transition,
                durationSec: tScenes[i]?.durationSec ?? Math.max(0.5, sc.end - sc.start)
              };
            });
            return { ...ws, timeline: { ...ws.timeline, preset: presetName, scenes: tScenes } };
          })
        ),

      setMusic: (id, patch) =>
        set((s) =>
          withWs(s, id, (ws) => ({
            ...ws,
            timeline: { ...ws.timeline, music: { ...ws.timeline.music, ...patch } }
          }))
        ),

      toggleCaptions: (id, enabled) =>
        set((s) =>
          withWs(s, id, (ws) => ({
            ...ws,
            timeline: { ...ws.timeline, captionsEnabled: enabled }
          }))
        )
    }),
    {
      name: 'shorts-editor',
      partialize: (s) => ({ byWorkspace: s.byWorkspace })
    }
  )
);

// Convenience selector hook for one workspace's editor slice.
export function useWorkspaceEditor(id: string): WorkspaceEditor {
  return useEditorStore((s) => s.byWorkspace[id] ?? EMPTY_EDITOR);
}
