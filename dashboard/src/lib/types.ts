// Mirror of the server's domain types (kept in sync manually; small surface).

export type StageStatus = 'not_started' | 'in_progress' | 'completed' | 'failed';
export type Language = 'en' | 'hi' | 'bilingual';
export type VisualType = 'Image' | 'Video' | 'Animation' | 'SplitScreen';

export type Stage = { status: StageStatus; updatedAt?: string };
export type Stages = {
  script: Stage;
  audio: Stage;
  caption: Stage;
  video: Stage;
  upload: Stage;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  language: Language;
  stages: Stages;
};

export type Voice = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  language: string;
  accent: string;
  gender: string;
};

export type AudioVersion = {
  version: number;
  voiceId: string;
  voiceName: string;
  model: string;
  file: string;
  durationSec: number;
  sizeBytes: number;
  genTimeSec: number;
  source: 'generated' | 'uploaded';
  createdAt: string;
};

export type AudioState = { currentVersion: number | null; versions: AudioVersion[] };

export type CaptionSettings = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  strokeColor: string;
  strokeWidth: number;
  highlightColor: string;
  position: 'top' | 'center' | 'bottom';
  uppercase: boolean;
};

export type CaptionLine = { id: number; start: number; end: number; text: string };

export type CaptionOverlay = {
  file: string;
  background: 'transparent' | 'greenscreen';
  durationSec: number;
  createdAt: string;
};

export type CaptionsState = {
  language: string;
  settings: CaptionSettings;
  hasTranscript: boolean;
  wordsCount: number;
  lines: CaptionLine[];
  files: { json?: string; srt?: string; words?: string };
  overlay: CaptionOverlay | null;
};

export type Manifest = WorkspaceSummary & {
  script: { currentVersion: number | null; versions: ScriptVersionMeta[] };
  audio: AudioState;
  captions: CaptionsState;
  scenes: unknown[];
  renders: unknown[];
  upload: { platform: string; visibility: 'public' | 'private' | 'unlisted' };
};

export type Scene = {
  scene: number;
  start: number;
  end: number;
  spokenLine: string;
  visualType: VisualType;
  searchKeywords: string[];
  visualDescription: string;
  imagePrompt: string;
};

export type ScriptVersion = {
  version: number;
  createdAt: string;
  topic: string;
  promptUsed: string;
  voiceoverScript: string;
  scenes: Scene[];
  provider: string;
  mock: boolean;
};

export type ScriptVersionMeta = {
  version: number;
  createdAt: string;
  topic: string;
  label: string;
};

export type PromptTemplate = { id: string; name: string; body: string };

export type Stats = {
  workspaces: number;
  videosGenerated: number;
  videosUploaded: number;
  totalViews: number;
};

export const STAGE_TABS = [
  { key: 'script', label: 'Script Generator', tab: 'script' },
  { key: 'audio', label: 'Audio Generator', tab: 'audio' },
  { key: 'caption', label: 'Caption Maker', tab: 'caption' },
  { key: 'video', label: 'Video Creator', tab: 'video' },
  { key: 'upload', label: 'Video Uploader', tab: 'upload' }
] as const;

export type TabKey = (typeof STAGE_TABS)[number]['tab'];
