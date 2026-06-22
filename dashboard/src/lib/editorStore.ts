import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Scene } from './types';
import {
  PRESETS,
  defaultEffect,
  presetEffect,
  randomTransition,
  type Transition
} from './editorOptions';

// ── Shapes ───────────────────────────────────────────────────────────────────
// Interim, client-only Video Editor state (timeline tweaks). Per-scene *assets*
// now live in the manifest (see queries `useAssets`); this store is timeline-only
// until the editor itself goes functional.
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

export type ProjectEditor = {
  timeline: {
    scenes: Record<number, TimelineScene>;
    preset: string | null;
    music: MusicSettings;
    captionsEnabled: boolean;
    soundsEnabled: boolean;
  };
};

const emptyMusic = (): MusicSettings => ({
  enabled: false,
  name: '',
  volume: 30,
  fadeIn: true,
  fadeOut: true
});

const emptyEditor = (): ProjectEditor => ({
  timeline: { scenes: {}, preset: null, music: emptyMusic(), captionsEnabled: true, soundsEnabled: true }
});

// Stable reference for the "no data yet" case, so selectors don't loop in React.
const EMPTY_EDITOR: ProjectEditor = emptyEditor();

type EditorState = {
  byProject: Record<string, ProjectEditor>;

  ensureTimeline: (id: string, scenes: Scene[]) => void;
  setSceneEffect: (id: string, i: number, effect: string) => void;
  setSceneTransition: (id: string, i: number, transition: Transition) => void;
  setSceneDuration: (id: string, i: number, durationSec: number) => void;
  applyPreset: (id: string, presetName: string, scenes: Scene[]) => void;
  setMusic: (id: string, patch: Partial<MusicSettings>) => void;
  toggleCaptions: (id: string, enabled: boolean) => void;
  toggleSounds: (id: string, enabled: boolean) => void;
};

// Immutably update a project's editor slice, creating it if missing.
function withWs(
  state: EditorState,
  id: string,
  fn: (ws: ProjectEditor) => ProjectEditor
): Pick<EditorState, 'byProject'> {
  const current = state.byProject[id] ?? emptyEditor();
  return { byProject: { ...state.byProject, [id]: fn(current) } };
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      byProject: {},

      ensureTimeline: (id, scenes) =>
        set((s) =>
          withWs(s, id, (ws) => {
            const tScenes = { ...ws.timeline.scenes };
            scenes.forEach((sc, i) => {
              if (!tScenes[i]) {
                // "Looks good immediately": default effect + a random transition.
                tScenes[i] = {
                  effect: defaultEffect(sc.visualType),
                  transition: randomTransition(`${id}:${i}`),
                  durationSec: Math.max(0.5, sc.end - sc.start)
                };
              }
            });
            return { ...ws, timeline: { ...ws.timeline, scenes: tScenes } };
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
        ),

      toggleSounds: (id, enabled) =>
        set((s) =>
          withWs(s, id, (ws) => ({
            ...ws,
            timeline: { ...ws.timeline, soundsEnabled: enabled }
          }))
        )
    }),
    {
      name: 'shorts-editor',
      partialize: (s) => ({ byProject: s.byProject })
    }
  )
);

// Convenience selector hook for one project's editor slice.
export function useProjectEditor(id: string): ProjectEditor {
  return useEditorStore((s) => s.byProject[id] ?? EMPTY_EDITOR);
}
