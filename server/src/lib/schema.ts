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
  uppercase: z.boolean().default(true)
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
  scenes: z.array(z.any()).default([]),
  renders: z.array(z.any()).default([]),
  upload: z
    .object({
      platform: z.string().default('youtube'),
      visibility: z.enum(['public', 'private', 'unlisted']).default('private')
    })
    .default({ platform: 'youtube', visibility: 'private' })
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
