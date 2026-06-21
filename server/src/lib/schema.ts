import { z } from 'zod';

export const StageStatus = z.enum([
  'not_started',
  'in_progress',
  'completed',
  'failed'
]);
export type StageStatus = z.infer<typeof StageStatus>;

export const Stage = z.object({
  status: StageStatus.default('not_started'),
  updatedAt: z.string().optional()
});

export const Language = z.enum(['en', 'hi', 'bilingual']);
export type Language = z.infer<typeof Language>;

export const VisualType = z.enum(['Image', 'Video', 'Animation', 'SplitScreen']);
export type VisualType = z.infer<typeof VisualType>;

export const Scene = z.object({
  scene: z.number(),
  start: z.number(),
  end: z.number(),
  spokenLine: z.string().default(''),
  visualType: VisualType.default('Image'),
  searchKeywords: z.array(z.string()).default([]),
  visualDescription: z.string().default(''),
  imagePrompt: z.string().default('')
});
export type Scene = z.infer<typeof Scene>;

export const ScriptVersion = z.object({
  version: z.number(),
  createdAt: z.string(),
  topic: z.string().default(''),
  promptUsed: z.string().default(''),
  voiceoverScript: z.string().default(''),
  scenes: z.array(Scene).default([]),
  provider: z.string().default(''),
  mock: z.boolean().default(false)
});
export type ScriptVersion = z.infer<typeof ScriptVersion>;

export const AudioVersion = z.object({
  version: z.number(),
  voiceId: z.string().default(''),
  voiceName: z.string().default(''),
  model: z.string().default('eleven_multilingual_v2'),
  file: z.string(), // relative to the workspace dir, e.g. "audio/v1.mp3"
  durationSec: z.number().default(0),
  sizeBytes: z.number().default(0),
  genTimeSec: z.number().default(0),
  speed: z.number().default(1), // playback speed baked into the file (1–2x)
  source: z.enum(['generated', 'uploaded']).default('generated'),
  createdAt: z.string()
});
export type AudioVersion = z.infer<typeof AudioVersion>;

export const CaptionSettings = z.object({
  fontFamily: z.string().default('Inter'),
  fontSize: z.number().default(60),
  fontWeight: z.number().default(800),
  textColor: z.string().default('#FFFFFF'),
  strokeColor: z.string().default('#000000'),
  strokeWidth: z.number().default(6),
  highlightColor: z.string().default('#E11D2A'),
  // Vertical position only: 0 = top, 100 = bottom.
  positionY: z.number().min(0).max(100).default(78),
  uppercase: z.boolean().default(true),
  // How many words show per caption line (2 = punchy, 5 = denser).
  wordsPerLine: z.number().int().min(2).max(5).default(4)
});
export type CaptionSettings = z.infer<typeof CaptionSettings>;

export const CaptionLine = z.object({
  id: z.number(),
  start: z.number(),
  end: z.number(),
  text: z.string()
});
export type CaptionLine = z.infer<typeof CaptionLine>;

export const CaptionsState = z.object({
  language: z.string().default(''),
  settings: CaptionSettings.default({}),
  hasTranscript: z.boolean().default(false),
  wordsCount: z.number().default(0),
  lines: z.array(CaptionLine).default([]),
  files: z
    .object({
      json: z.string().optional(),
      srt: z.string().optional(),
      words: z.string().optional()
    })
    .default({}),
  overlay: z
    .object({
      createdAt: z.string(),
      durationSec: z.number(),
      hasAudio: z.boolean().default(false),
      normal: z.object({ file: z.string(), sizeBytes: z.number() }).nullable().default(null),
      green: z.object({ file: z.string(), sizeBytes: z.number() }).nullable().default(null)
    })
    .nullable()
    .default(null)
});
export type CaptionsState = z.infer<typeof CaptionsState>;

// A single visual asset attached to (or a candidate for) a scene. `thumbUrl` is
// a remote preview for the candidates grid; `file` is set (workspace-relative)
// once the asset has been downloaded/uploaded into the workspace.
export const AssetRef = z.object({
  origin: z.enum(['stock', 'upload', 'library']).default('stock'),
  source: z.enum(['library', 'pexels', 'pixabay', 'upload']).default('pexels'),
  kind: z.enum(['video', 'image']),
  label: z.string().default(''),
  width: z.number().default(0),
  height: z.number().default(0),
  orientation: z.string().default('unknown'),
  thumbUrl: z.string().default(''),
  downloadUrl: z.string().nullable().default(null),
  downloadUrls: z.array(z.string()).default([]), // ordered renditions (best→worst)
  libraryPath: z.string().nullable().default(null),
  file: z.string().nullable().default(null),
  sizeBytes: z.number().default(0)
});
export type AssetRef = z.infer<typeof AssetRef>;

// A user-provided media file dropped into the workspace's asset library.
export const LibraryItem = z.object({
  id: z.string(),
  kind: z.enum(['image', 'video', 'audio']),
  file: z.string(), // workspace-relative, e.g. 'library/<id>.mp4'
  name: z.string().default(''),
  sizeBytes: z.number().default(0),
  createdAt: z.string()
});
export type LibraryItem = z.infer<typeof LibraryItem>;

// A sound effect placed on the video timeline at an absolute time (copied into
// the workspace from the global sound library).
export const SoundPlacement = z.object({
  id: z.string(),
  name: z.string().default(''),
  file: z.string(), // workspace-relative, e.g. 'sounds/<id>.mp3'
  atSec: z.number().default(0),
  durationSec: z.number().default(0),
  volume: z.number().default(1)
});
export type SoundPlacement = z.infer<typeof SoundPlacement>;

export const SceneAssets = z.object({
  sceneNumber: z.number(),
  keywords: z.array(z.string()).default([]),
  imagePrompt: z.string().default(''),
  candidates: z.array(AssetRef).default([]),
  selected: AssetRef.nullable().default(null)
});
export type SceneAssets = z.infer<typeof SceneAssets>;

export const AssetsState = z.object({
  scenes: z.array(SceneAssets).default([]),
  updatedAt: z.string().optional()
});
export type AssetsState = z.infer<typeof AssetsState>;

// A rendered video produced by the Video Editor step. Progress/phase are updated
// live while a background render runs; file/sizeBytes are set once completed.
export const RenderRecord = z.object({
  id: z.string(),
  status: z.enum(['rendering', 'completed', 'failed']).default('rendering'),
  progress: z.number().default(0), // 0..100
  phase: z.string().default('bundling'), // 'bundling' | 'rendering'
  file: z.string().nullable().default(null), // workspace-relative mp4 once done
  durationSec: z.number().default(0),
  fps: z.number().default(30),
  resolution: z.string().default('1080×1920'),
  sizeBytes: z.number().default(0),
  preset: z.string().nullable().default(null),
  error: z.string().optional(),
  createdAt: z.string(),
  completedAt: z.string().optional()
});
export type RenderRecord = z.infer<typeof RenderRecord>;

export const ScriptVersionMeta = z.object({
  version: z.number(),
  createdAt: z.string(),
  topic: z.string().default(''),
  label: z.string().default('')
});
export type ScriptVersionMeta = z.infer<typeof ScriptVersionMeta>;

export const Manifest = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  language: Language.default('en'),
  stages: z.object({
    script: Stage,
    audio: Stage,
    caption: Stage,
    // Added after the original 5 stages — default so pre-existing manifests
    // (which lack `assets`) still parse.
    assets: Stage.default({ status: 'not_started' }),
    video: Stage,
    upload: Stage
  }),
  script: z.object({
    currentVersion: z.number().nullable().default(null),
    versions: z.array(ScriptVersionMeta).default([])
  }),
  audio: z
    .object({
      currentVersion: z.number().nullable().default(null),
      versions: z.array(AudioVersion).default([])
    })
    .default({ currentVersion: null, versions: [] }),
  captions: CaptionsState.default({}),
  // Per-scene visual assets. `.default` so pre-existing manifests still parse.
  assets: AssetsState.default({ scenes: [] }),
  // Optional background-music track for the Video Editor.
  music: z
    .object({ file: z.string().nullable().default(null), name: z.string().default('') })
    .default({ file: null, name: '' }),
  // User-dropped media (images/videos/audio) available across steps.
  library: z.array(LibraryItem).default([]),
  // Sound effects placed on the video timeline.
  sounds: z.array(SoundPlacement).default([]),
  // Canonical, editable scene-by-scene breakdown (built in the Assets step from
  // the script OR the caption transcript). `.default([])` so old manifests parse.
  scenes: z.array(Scene).default([]),
  renders: z.array(RenderRecord).default([]),
  upload: z
    .object({
      platform: z.string().default('youtube'),
      visibility: z.enum(['public', 'private', 'unlisted']).default('public'),
      title: z.string().default(''),
      description: z.string().default(''),
      tags: z.array(z.string()).default([]),
      // Live YouTube publish job state.
      youtube: z
        .object({
          status: z.enum(['idle', 'uploading', 'completed', 'failed']).default('idle'),
          progress: z.number().default(0),
          videoId: z.string().nullable().default(null),
          url: z.string().nullable().default(null),
          renderId: z.string().nullable().default(null),
          error: z.string().optional(),
          uploadedAt: z.string().optional()
        })
        .default({ status: 'idle', progress: 0, videoId: null, url: null, renderId: null })
    })
    .default({ platform: 'youtube', visibility: 'public', title: '', description: '', tags: [] })
});
export type Manifest = z.infer<typeof Manifest>;

export const PromptTemplate = z.object({
  id: z.string(),
  name: z.string(),
  body: z.string().default('')
});
export type PromptTemplate = z.infer<typeof PromptTemplate>;

export type WorkspaceSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  language: Language;
  stages: Manifest['stages'];
};

export function emptyStages(): Manifest['stages'] {
  return {
    script: { status: 'not_started' },
    audio: { status: 'not_started' },
    caption: { status: 'not_started' },
    assets: { status: 'not_started' },
    video: { status: 'not_started' },
    upload: { status: 'not_started' }
  };
}
