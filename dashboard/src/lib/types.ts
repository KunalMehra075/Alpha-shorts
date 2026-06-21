// Mirror of the server's domain types (kept in sync manually; small surface).

export type StageStatus = 'not_started' | 'in_progress' | 'completed' | 'failed';
export type Language = 'en' | 'hi' | 'bilingual';
export type VisualType = 'Image' | 'Video' | 'Animation' | 'SplitScreen';

export type Stage = { status: StageStatus; updatedAt?: string };
export type Stages = {
  script: Stage;
  audio: Stage;
  caption: Stage;
  assets: Stage;
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
  speed: number;
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
  positionY: number; // 0 = top, 100 = bottom
  uppercase: boolean;
  wordsPerLine: number; // 2–5 words shown per caption line
};

export type CaptionLine = { id: number; start: number; end: number; text: string };

export type CaptionMedia = { file: string; sizeBytes: number };

export type CaptionOverlay = {
  createdAt: string;
  durationSec: number;
  hasAudio: boolean;
  normal: CaptionMedia | null;
  green: CaptionMedia | null;
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

export type AssetRef = {
  origin: 'stock' | 'upload' | 'library';
  source: 'library' | 'pexels' | 'pixabay' | 'upload';
  kind: 'video' | 'image';
  label: string;
  width: number;
  height: number;
  orientation: string;
  thumbUrl: string;
  downloadUrl: string | null;
  downloadUrls: string[];
  libraryPath: string | null;
  file: string | null;
  sizeBytes: number;
};

export type SceneAssets = {
  sceneNumber: number;
  keywords: string[];
  imagePrompt: string;
  candidates: AssetRef[];
  selected: AssetRef | null;
};

export type AssetsState = { scenes: SceneAssets[]; updatedAt?: string };

export type RenderStatus = 'rendering' | 'completed' | 'failed';

export type RenderRecord = {
  id: string;
  status: RenderStatus;
  progress: number; // 0..100
  phase: string; // 'bundling' | 'rendering'
  file: string | null;
  durationSec: number;
  fps: number;
  resolution: string;
  sizeBytes: number;
  preset: string | null;
  error?: string;
  createdAt: string;
  completedAt?: string;
};

export type MusicTrack = { file: string | null; name: string };

export type LibraryItem = {
  id: string;
  kind: 'image' | 'video' | 'audio';
  file: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
};

export type RenderTimelinePayload = {
  scenes: { index: number; effect: string; transition: string; durationSec: number }[];
  captionsEnabled: boolean;
  preset: string | null;
  music: { enabled: boolean; volume: number; fadeIn: boolean; fadeOut: boolean };
};

export type Manifest = WorkspaceSummary & {
  script: { currentVersion: number | null; versions: ScriptVersionMeta[] };
  audio: AudioState;
  captions: CaptionsState;
  assets: AssetsState;
  music: MusicTrack;
  library: LibraryItem[];
  scenes: Scene[];
  renders: RenderRecord[];
  upload: UploadMeta;
};

export type YoutubeState = {
  status: 'idle' | 'uploading' | 'completed' | 'failed';
  progress: number;
  videoId: string | null;
  url: string | null;
  renderId: string | null;
  error?: string;
  uploadedAt?: string;
};

export type YoutubeStatus = YoutubeState & { configured: boolean };

export type UploadMeta = {
  platform: string;
  visibility: 'public' | 'private' | 'unlisted';
  title: string;
  description: string;
  tags: string[];
  youtube: YoutubeState;
};

export type SeoSuggestions = {
  titles: string[];
  descriptions: string[];
  tags: string[];
  provider: string;
  mock: boolean;
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

export type ScenePatch = {
  spokenLine?: string;
  visualType?: VisualType;
  searchKeywords?: string[];
  imagePrompt?: string;
  visualDescription?: string;
  durationSec?: number;
};

export type BreakdownResult = { scenes: Scene[]; provider: string; mock: boolean; source: 'script' | 'transcript' };

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
  { key: 'assets', label: 'Assets', tab: 'assets' },
  { key: 'video', label: 'Video Editor', tab: 'video' },
  { key: 'upload', label: 'Video Uploader', tab: 'upload' }
] as const;

export type TabKey = (typeof STAGE_TABS)[number]['tab'];
