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

export type ProjectSummary = {
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
  sourceDurationSec: number;
  trimStartSec: number;
  trimEndSec: number | null;
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

export type MediaKind = 'image' | 'video' | 'audio';

export type MediaItem = {
  id: string;
  kind: MediaKind;
  file: string; // relative to the global /library dir
  name: string;
  sizeBytes: number;
  durationSec: number; // 0 for images
  createdAt: string;
};

export type SoundItem = {
  id: string;
  name: string;
  file: string; // relative to the global /sounds dir
  durationSec: number;
  sizeBytes: number;
  createdAt: string;
};

export type SoundPlacement = {
  id: string;
  name: string;
  file: string; // project-relative
  atSec: number;
  durationSec: number;
  volume: number;
};

export type ElementKind = 'image' | 'gif' | 'video';
export type ElementAnimation = 'none' | 'fade' | 'pop' | 'pulse' | 'slide';

export type ElementItem = {
  id: string;
  name: string;
  file: string; // relative to the global /element-lib dir
  kind: ElementKind;
  sizeBytes: number;
  durationSec: number; // 0 for static images
  thumb?: string | null; // poster image for video elements
  createdAt: string;
};

// Background-removal (chroma key) parameters for the Elements library tool.
export type BgParams = {
  color: string; // hex, e.g. #00ff00
  similarity: number; // 0..1 (strength)
  blend: number; // 0..1 (edge softness)
  despill: boolean;
};

export type ElementPlacement = {
  id: string;
  name: string;
  file: string; // project-relative
  kind: ElementKind;
  layer: number;
  x: number; // center %, 0-100
  y: number; // center %, 0-100
  size: number; // width % of frame
  rotation: number; // degrees
  startSec: number;
  endSec: number;
  animation: ElementAnimation;
  muted: boolean; // video elements: mute/keep audio in the render
};

export type RenderTimelinePayload = {
  scenes: {
    index: number;
    effect: string;
    transition: string;
    durationSec: number;
    motion: string;
    zoom: number;
    intensity: number;
  }[];
  captionsEnabled: boolean;
  preset: string | null;
  music: { enabled: boolean; volume: number; fadeIn: boolean; fadeOut: boolean };
  soundsEnabled: boolean;
};

export type Manifest = ProjectSummary & {
  category: string | null;
  hookStyle: string | null;
  script: { currentVersion: number | null; versions: ScriptVersionMeta[] };
  audio: AudioState;
  captions: CaptionsState;
  assets: AssetsState;
  music: MusicTrack;
  library: LibraryItem[];
  sounds: SoundPlacement[];
  elements: ElementPlacement[];
  elementLayers: number;
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
  thumbnailWarning?: string;
  uploadedAt?: string;
};

export type YoutubeStatus = YoutubeState & { configured: boolean };

export type Thumbnail = {
  file: string | null; // project-relative, served at /media/<id>/<file>
  source: 'asset' | 'import' | 'ai' | 'frame' | null;
  sizeBytes: number;
};

export type UploadMeta = {
  platform: string;
  visibility: 'public' | 'private' | 'unlisted';
  title: string;
  description: string;
  tags: string[];
  thumbnail: Thumbnail;
  youtube: YoutubeState;
};

// ── Analytics ─────────────────────────────────────────────────────────────────
export type AnalyticsRange = '7d' | '30d' | '90d' | '365d' | 'lifetime';

export type AnalyticsChannel = {
  id: string;
  title: string;
  thumbnail: string | null;
  publishedAt: string | null;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
};

export type KpiCard = {
  key: string;
  label: string;
  value: number;
  unit: string | null;
  delta: number | null; // % change vs previous period; null = no baseline
};

export type AnalyticsOverview = {
  range: AnalyticsRange;
  fetchedAt: string;
  channel: AnalyticsChannel;
  cards: KpiCard[];
};

export type AnalyticsSeriesPoint = {
  date: string;
  views: number;
  subscribers: number;
  likes: number;
  comments: number;
  watchTime: number;
  engagement: number;
};

export type VideoAnalyticsRow = {
  videoId: string;
  title: string;
  thumbnail: string | null;
  publishedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTime: number;
  avgViewDuration: number;
  retention: number;
  subscribersGained: number;
  engagementRate: number;
};

export type TopVideos = {
  range: AnalyticsRange;
  fetchedAt: string;
  byViews: VideoAnalyticsRow[];
  byRetention: VideoAnalyticsRow[];
  bySubscribers: VideoAnalyticsRow[];
  byEngagement: VideoAnalyticsRow[];
};

export type AnalyticsStatus = {
  configured: boolean;
  needsReauth: boolean;
  hasClient: boolean; // GOOGLE_CLIENT_ID + SECRET present (can run OAuth)
  redirectUri?: string;
  message?: string;
  lastFetched?: string | null;
};

export type OauthResult = { refreshToken?: string; pending?: boolean };

export type ImageGenStatus = { available: boolean; providers: string[] };

// Data responses may instead carry a re-auth flag (HTTP 200) — handle in the UI.
export type NeedsReauth = { needsReauth: true; message: string };
export type WithReauth<T> = T | NeedsReauth;

export type ProjectAnalytics =
  | { published: false }
  | { published: true; videoId: string; url: string; video: VideoAnalyticsRow | null };

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

// Background Assets jobs (breakdown / autofill) — polled so progress survives navigation.
export type SceneJob = {
  type: 'breakdown' | 'autofill';
  status: 'running' | 'done' | 'error';
  total: number;
  done: number;
  error?: string;
  startedAt: string;
  updatedAt: string;
  meta?: { mock?: boolean; provider?: string; source?: 'script' | 'transcript'; sceneCount?: number };
};
export type SceneJobs = { breakdown: SceneJob | null; autofill: SceneJob | null };

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
  projects: number;
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
