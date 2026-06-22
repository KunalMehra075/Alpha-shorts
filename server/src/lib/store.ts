import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { customAlphabet } from 'nanoid';
import {
  CONFIG_DIR,
  TEMPLATES_FILE,
  WORKSPACES_DIR,
  ensureBaseDirs,
  workspaceDir
} from './paths';
import {
  copyDir,
  ensureDir,
  existsSync,
  readJson,
  readJsonOr,
  removePath,
  writeJson
} from './fsx';
import {
  Manifest,
  PromptTemplate,
  ScriptVersion,
  emptyStages,
  type AudioVersion,
  type Language,
  type RenderRecord,
  type Scene,
  type StageStatus,
  type WorkspaceSummary
} from './schema';

const shortId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 6);

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function now() {
  return new Date().toISOString();
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workspace'
  );
}

function manifestPath(id: string) {
  return join(workspaceDir(id), 'workspace.json');
}

function scriptDir(id: string) {
  return join(workspaceDir(id), 'script');
}

function scriptVersionPath(id: string, version: number) {
  return join(scriptDir(id), 'versions', `v${version}.json`);
}

// ── Workspaces ──────────────────────────────────────────────────────────────

export function readManifest(id: string): Manifest {
  const file = manifestPath(id);
  if (!existsSync(file)) throw new HttpError(404, `Workspace "${id}" not found.`);
  return Manifest.parse(readJson(file));
}

function writeManifest(m: Manifest): Manifest {
  m.updatedAt = now();
  writeJson(manifestPath(m.id), m);
  return m;
}

export function listWorkspaces(): WorkspaceSummary[] {
  ensureBaseDirs();
  const entries = readdirSync(WORKSPACES_DIR, { withFileTypes: true });
  const out: WorkspaceSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const file = manifestPath(e.name);
    if (!existsSync(file)) continue;
    try {
      const m = Manifest.parse(readJson(file));
      out.push({
        id: m.id,
        name: m.name,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        language: m.language,
        stages: m.stages
      });
    } catch {
      /* skip malformed */
    }
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}

export function createWorkspace(name: string, language: Language = 'en'): Manifest {
  ensureBaseDirs();
  const trimmed = (name || '').trim();
  if (!trimmed) throw new HttpError(400, 'Workspace name is required.');

  const id = `${slugify(trimmed)}-${shortId()}`;
  ensureDir(workspaceDir(id));
  ensureDir(join(scriptDir(id), 'versions'));

  const manifest: Manifest = Manifest.parse({
    id,
    name: trimmed,
    createdAt: now(),
    updatedAt: now(),
    language,
    stages: emptyStages(),
    script: { currentVersion: null, versions: [] }
  });
  return writeManifest(manifest);
}

export function updateWorkspace(
  id: string,
  patch: { name?: string; language?: Language }
): Manifest {
  const m = readManifest(id);
  if (typeof patch.name === 'string' && patch.name.trim()) m.name = patch.name.trim();
  if (patch.language) m.language = patch.language;
  return writeManifest(m);
}

export function duplicateWorkspace(id: string): Manifest {
  const src = readManifest(id);
  const newId = `${slugify(src.name)}-${shortId()}`;
  copyDir(workspaceDir(id), workspaceDir(newId));
  const m = readManifest(newId);
  m.id = newId;
  m.name = `${src.name} (Copy)`;
  m.createdAt = now();
  return writeManifest(m);
}

export function deleteWorkspace(id: string) {
  if (!existsSync(manifestPath(id))) throw new HttpError(404, `Workspace "${id}" not found.`);
  removePath(workspaceDir(id));
}

function setStage(m: Manifest, stage: keyof Manifest['stages'], status: StageStatus) {
  m.stages[stage] = { status, updatedAt: now() };
}

// ── Script ────────────────────────────────────────────────────────────────

export function getCurrentScript(id: string): ScriptVersion | null {
  const m = readManifest(id);
  if (m.script.currentVersion == null) return null;
  const file = scriptVersionPath(id, m.script.currentVersion);
  if (!existsSync(file)) return null;
  return ScriptVersion.parse(readJson(file));
}

export function getScriptVersion(id: string, version: number): ScriptVersion {
  const file = scriptVersionPath(id, version);
  if (!existsSync(file)) throw new HttpError(404, `Script version ${version} not found.`);
  return ScriptVersion.parse(readJson(file));
}

export function listScriptVersions(id: string) {
  return readManifest(id).script.versions;
}

function nextVersionNumber(m: Manifest): number {
  return m.script.versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
}

// Create a brand-new version (used by generate). Becomes current.
export function addScriptVersion(
  id: string,
  data: {
    topic: string;
    promptUsed: string;
    voiceoverScript: string;
    scenes: any[];
    provider?: string;
    mock?: boolean;
  }
): ScriptVersion {
  const m = readManifest(id);
  const version = nextVersionNumber(m);
  const sv: ScriptVersion = ScriptVersion.parse({
    version,
    createdAt: now(),
    topic: data.topic,
    promptUsed: data.promptUsed,
    voiceoverScript: data.voiceoverScript,
    scenes: data.scenes,
    provider: data.provider ?? '',
    mock: data.mock ?? false
  });
  writeJson(scriptVersionPath(id, version), sv);

  m.script.versions.push({
    version,
    createdAt: sv.createdAt,
    topic: sv.topic,
    label: `Version ${version}`
  });
  m.script.currentVersion = version;
  setStage(m, 'script', 'completed');
  writeManifest(m);
  return sv;
}

// Save manual edits to the current version in place (no new version).
export function saveCurrentScript(
  id: string,
  data: Partial<ScriptVersion>
): ScriptVersion {
  const m = readManifest(id);
  if (m.script.currentVersion == null) {
    // No version yet — create the first one from the edits.
    return addScriptVersion(id, {
      topic: data.topic ?? '',
      promptUsed: data.promptUsed ?? '',
      voiceoverScript: data.voiceoverScript ?? '',
      scenes: data.scenes ?? [],
      mock: false
    });
  }
  const current = getScriptVersion(id, m.script.currentVersion);
  const merged: ScriptVersion = ScriptVersion.parse({
    ...current,
    ...data,
    version: current.version,
    createdAt: current.createdAt
  });
  writeJson(scriptVersionPath(id, current.version), merged);
  setStage(m, 'script', 'completed');
  writeManifest(m);
  return merged;
}

export function restoreScriptVersion(id: string, version: number): ScriptVersion {
  const sv = getScriptVersion(id, version); // throws if missing
  const m = readManifest(id);
  m.script.currentVersion = version;
  setStage(m, 'script', 'completed');
  writeManifest(m);
  return sv;
}

// ── Scenes (canonical breakdown) ──────────────────────────────────────────────

// Re-flow scene numbers + contiguous start/end from each scene's own duration.
function recomputeTimings(scenes: Scene[]): Scene[] {
  let t = 0;
  return scenes.map((s, i) => {
    const raw = (s.end ?? 0) - (s.start ?? 0);
    const dur = Math.max(0.5, raw > 0 ? raw : 3);
    const start = Math.round(t * 100) / 100;
    const end = Math.round((t + dur) * 100) / 100;
    t = end;
    return { ...s, scene: i + 1, start, end };
  });
}

// The editable breakdown. Backfills once from the current script version so
// pre-existing workspaces (which stored scenes on the script) keep working.
export function getScenes(id: string): Scene[] {
  const m = readManifest(id);
  if (m.scenes.length === 0 && m.script.currentVersion != null) {
    const file = scriptVersionPath(id, m.script.currentVersion);
    if (existsSync(file)) {
      const sv = ScriptVersion.parse(readJson(file));
      if (sv.scenes?.length) {
        m.scenes = sv.scenes;
        writeManifest(m);
      }
    }
  }
  return m.scenes;
}

export function setScenes(id: string, scenes: Scene[]): Scene[] {
  const m = readManifest(id);
  m.scenes = recomputeTimings(scenes);
  writeManifest(m);
  return m.scenes;
}

export type ScenePatch = {
  spokenLine?: string;
  visualType?: Scene['visualType'];
  searchKeywords?: string[];
  imagePrompt?: string;
  visualDescription?: string;
  durationSec?: number;
};

export function updateScene(id: string, sceneNumber: number, patch: ScenePatch): Scene[] {
  const m = readManifest(id);
  const idx = m.scenes.findIndex((s) => s.scene === sceneNumber);
  if (idx < 0) throw new HttpError(404, `Scene ${sceneNumber} not found.`);
  const cur = { ...m.scenes[idx] };
  if (patch.spokenLine !== undefined) cur.spokenLine = patch.spokenLine;
  if (patch.visualType !== undefined) cur.visualType = patch.visualType;
  if (patch.searchKeywords !== undefined) cur.searchKeywords = patch.searchKeywords;
  if (patch.imagePrompt !== undefined) cur.imagePrompt = patch.imagePrompt;
  if (patch.visualDescription !== undefined) cur.visualDescription = patch.visualDescription;
  if (patch.durationSec !== undefined && patch.durationSec > 0) {
    cur.end = cur.start + patch.durationSec; // recompute fixes contiguous start/end
  }
  m.scenes[idx] = cur;
  m.scenes = recomputeTimings(m.scenes);
  writeManifest(m);
  return m.scenes;
}

// Append a new (manual) scene. Append-only, so existing scene numbers are
// unchanged and ensureSceneRows can safely add the matching empty asset row.
export function addScene(
  id: string,
  opts: { visualType?: Scene['visualType']; durationSec?: number; spokenLine?: string } = {}
): Scene[] {
  const m = readManifest(id);
  const dur = Math.max(0.5, opts.durationSec ?? 3);
  const scene: Scene = {
    scene: m.scenes.length + 1,
    start: 0,
    end: dur, // recomputeTimings reflows contiguous start/end
    spokenLine: opts.spokenLine ?? '',
    visualType: opts.visualType ?? 'Image',
    searchKeywords: [],
    visualDescription: '',
    imagePrompt: ''
  };
  m.scenes.push(scene);
  m.scenes = recomputeTimings(m.scenes);
  writeManifest(m);
  ensureSceneRows(id); // append-only → safely adds the new row
  return getScenes(id);
}

// Remove one scene + its asset row + its asset file, then renumber scenes and
// asset rows together (rows are kept aligned to scenes by ascending number, so
// we zip by position). `selected.file` paths are left as-is — the render reads
// the file path directly, not a scene-number-derived name.
export function removeScene(id: string, sceneNumber: number): Scene[] {
  const m = readManifest(id);
  const idx = m.scenes.findIndex((s) => s.scene === sceneNumber);
  if (idx < 0) throw new HttpError(404, `Scene ${sceneNumber} not found.`);

  const row = m.assets.scenes.find((r) => r.sceneNumber === sceneNumber);
  if (row?.selected?.file) removePath(join(workspaceDir(id), row.selected.file));

  m.scenes.splice(idx, 1);
  m.scenes = recomputeTimings(m.scenes); // scene = i + 1

  const remainingRows = m.assets.scenes
    .filter((r) => r.sceneNumber !== sceneNumber)
    .sort((a, b) => a.sceneNumber - b.sceneNumber);
  remainingRows.forEach((r, i) => {
    r.sceneNumber = i + 1;
  });
  m.assets.scenes = remainingRows;
  m.assets.updatedAt = now();

  const allSelected = remainingRows.length > 0 && remainingRows.every((r) => r.selected);
  setStage(m, 'assets', remainingRows.length === 0 ? 'not_started' : allSelected ? 'completed' : 'in_progress');

  writeManifest(m);
  return m.scenes;
}

// ── Audio ────────────────────────────────────────────────────────────────────

export function audioDir(id: string) {
  return join(workspaceDir(id), 'audio');
}

export function nextAudioVersion(id: string): number {
  const m = readManifest(id);
  return m.audio.versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
}

export function getAudioState(id: string) {
  const m = readManifest(id);
  return m.audio;
}

export function addAudioVersion(id: string, take: AudioVersion): Manifest {
  const m = readManifest(id);
  m.audio.versions.push(take);
  m.audio.currentVersion = take.version;
  setStage(m, 'audio', 'completed');
  return writeManifest(m);
}

export function selectAudioVersion(id: string, version: number): Manifest {
  const m = readManifest(id);
  if (!m.audio.versions.some((v) => v.version === version)) {
    throw new HttpError(404, `Audio version ${version} not found.`);
  }
  m.audio.currentVersion = version;
  return writeManifest(m);
}

export function deleteAudioVersion(id: string, version: number): Manifest {
  const m = readManifest(id);
  const take = m.audio.versions.find((v) => v.version === version);
  if (!take) throw new HttpError(404, `Audio version ${version} not found.`);

  removePath(join(workspaceDir(id), take.file));
  m.audio.versions = m.audio.versions.filter((v) => v.version !== version);

  if (m.audio.currentVersion === version) {
    const latest = m.audio.versions.at(-1);
    m.audio.currentVersion = latest ? latest.version : null;
  }
  if (m.audio.versions.length === 0) setStage(m, 'audio', 'not_started');
  return writeManifest(m);
}

// ── Captions ─────────────────────────────────────────────────────────────────

export function captionsDir(id: string) {
  return join(workspaceDir(id), 'captions');
}

export function getCaptions(id: string) {
  return readManifest(id).captions;
}

export function setCaptions(
  id: string,
  patch: Partial<Manifest['captions']>,
  stage?: StageStatus
): Manifest {
  const m = readManifest(id);
  m.captions = { ...m.captions, ...patch };
  if (stage) setStage(m, 'caption', stage);
  return writeManifest(m);
}

// ── Assets ─────────────────────────────────────────────────────────────────────

export function assetsDir(id: string) {
  return join(workspaceDir(id), 'assets');
}

export function getAssetsState(id: string) {
  return readManifest(id).assets;
}

// Keep one asset row per canonical scene (idempotent): add rows for new scenes,
// prune rows for scenes that no longer exist. Keywords/prompt now live on the
// scene (manifest.scenes), so asset rows only hold candidates + the selection.
export function ensureSceneRows(id: string): Manifest['assets'] {
  const scenes = getScenes(id); // may backfill + persist
  const m = readManifest(id);
  const nums = new Set(scenes.map((s, i) => s.scene ?? i + 1));

  const byNumber = new Map(m.assets.scenes.map((r) => [r.sceneNumber, r]));
  let changed = false;
  for (let i = 0; i < scenes.length; i++) {
    const num = scenes[i].scene ?? i + 1;
    if (!byNumber.has(num)) {
      byNumber.set(num, { sceneNumber: num, keywords: [], imagePrompt: '', candidates: [], selected: null });
      changed = true;
    }
  }
  for (const num of [...byNumber.keys()]) {
    if (!nums.has(num)) {
      byNumber.delete(num);
      changed = true;
    }
  }
  if (changed) {
    m.assets.scenes = Array.from(byNumber.values()).sort((a, b) => a.sceneNumber - b.sceneNumber);
    writeManifest(m);
  }
  return m.assets;
}

// Merge a patch into a single scene row, refresh the assets stage status, persist.
export function setSceneAssets(
  id: string,
  sceneNumber: number,
  patch: Partial<Manifest['assets']['scenes'][number]>
): Manifest['assets'] {
  const m = readManifest(id);
  const row = m.assets.scenes.find((r) => r.sceneNumber === sceneNumber);
  if (row) {
    Object.assign(row, patch);
  } else {
    m.assets.scenes.push({
      sceneNumber,
      keywords: [],
      imagePrompt: '',
      candidates: [],
      selected: null,
      ...patch
    });
    m.assets.scenes.sort((a, b) => a.sceneNumber - b.sceneNumber);
  }
  m.assets.updatedAt = now();

  // Stage: completed once every scene row has a selection, else in_progress.
  const rows = m.assets.scenes;
  const allSelected = rows.length > 0 && rows.every((r) => r.selected);
  setStage(m, 'assets', allSelected ? 'completed' : 'in_progress');

  writeManifest(m);
  return m.assets;
}

// ── Media library ─────────────────────────────────────────────────────────────

export function libraryDir(id: string) {
  return join(workspaceDir(id), 'library');
}

export function getLibrary(id: string) {
  return readManifest(id).library;
}

export function addLibraryItem(id: string, item: Manifest['library'][number]): Manifest['library'] {
  const m = readManifest(id);
  m.library.unshift(item);
  writeManifest(m);
  return m.library;
}

export function deleteLibraryItem(id: string, itemId: string): Manifest['library'] {
  const m = readManifest(id);
  const item = m.library.find((x) => x.id === itemId);
  if (!item) throw new HttpError(404, `Library item "${itemId}" not found.`);
  removePath(join(workspaceDir(id), item.file));
  m.library = m.library.filter((x) => x.id !== itemId);
  writeManifest(m);
  return m.library;
}

// ── Timeline sound effects (per-video placements) ─────────────────────────────

export function soundsDir(id: string) {
  return join(workspaceDir(id), 'sounds');
}

export function getSounds(id: string) {
  return readManifest(id).sounds;
}

export function addSoundPlacement(id: string, rec: Manifest['sounds'][number]): Manifest['sounds'] {
  const m = readManifest(id);
  m.sounds.push(rec);
  m.sounds.sort((a, b) => a.atSec - b.atSec);
  writeManifest(m);
  return m.sounds;
}

export function updateSoundPlacement(
  id: string,
  placementId: string,
  patch: Partial<Manifest['sounds'][number]>
): Manifest['sounds'] {
  const m = readManifest(id);
  const rec = m.sounds.find((s) => s.id === placementId);
  if (!rec) throw new HttpError(404, `Sound placement "${placementId}" not found.`);
  if (patch.atSec !== undefined) rec.atSec = Math.max(0, patch.atSec);
  if (patch.volume !== undefined) rec.volume = Math.min(1, Math.max(0, patch.volume));
  m.sounds.sort((a, b) => a.atSec - b.atSec);
  writeManifest(m);
  return m.sounds;
}

export function removeSoundPlacement(id: string, placementId: string): Manifest['sounds'] {
  const m = readManifest(id);
  const rec = m.sounds.find((s) => s.id === placementId);
  if (!rec) throw new HttpError(404, `Sound placement "${placementId}" not found.`);
  removePath(join(workspaceDir(id), rec.file));
  m.sounds = m.sounds.filter((s) => s.id !== placementId);
  writeManifest(m);
  return m.sounds;
}

// ── Background music ──────────────────────────────────────────────────────────

export function musicDir(id: string) {
  return join(workspaceDir(id), 'music');
}

export function getMusic(id: string) {
  return readManifest(id).music;
}

export function setWorkspaceMusic(id: string, patch: Partial<Manifest['music']>): Manifest {
  const m = readManifest(id);
  m.music = { ...m.music, ...patch };
  return writeManifest(m);
}

// ── Renders (Video Editor) ──────────────────────────────────────────────────────

export function rendersDir(id: string) {
  return join(workspaceDir(id), 'renders');
}

export function getRenders(id: string) {
  return readManifest(id).renders;
}

export function addRender(id: string, rec: RenderRecord): Manifest {
  const m = readManifest(id);
  m.renders.unshift(rec);
  setStage(m, 'video', 'in_progress');
  return writeManifest(m);
}

export function updateRender(
  id: string,
  rid: string,
  patch: Partial<RenderRecord>
): Manifest {
  const m = readManifest(id);
  const rec = m.renders.find((r) => r.id === rid);
  if (rec) Object.assign(rec, patch);
  // Refresh the video stage from the records' collective state.
  if (m.renders.some((r) => r.status === 'completed')) {
    setStage(m, 'video', 'completed');
  } else if (m.renders.length && m.renders.every((r) => r.status === 'failed')) {
    setStage(m, 'video', 'failed');
  }
  return writeManifest(m);
}

export function deleteRender(id: string, rid: string): Manifest {
  const m = readManifest(id);
  const rec = m.renders.find((r) => r.id === rid);
  if (!rec) throw new HttpError(404, `Render "${rid}" not found.`);
  if (rec.file) removePath(join(workspaceDir(id), rec.file));
  m.renders = m.renders.filter((r) => r.id !== rid);
  if (!m.renders.some((r) => r.status === 'completed')) {
    setStage(m, 'video', m.renders.length ? 'in_progress' : 'not_started');
  }
  return writeManifest(m);
}

// ── Upload metadata ───────────────────────────────────────────────────────────

export function getUpload(id: string) {
  const m = readManifest(id);
  const u = m.upload;
  // One-time: an UNTOUCHED legacy 'private' default flips to the new 'public'
  // default. Workspaces where the uploader was actually used keep their choice.
  if (
    u.visibility === 'private' &&
    !u.title &&
    !u.description &&
    u.tags.length === 0 &&
    u.youtube.status === 'idle'
  ) {
    m.upload.visibility = 'public';
    writeManifest(m);
    return m.upload;
  }
  return u;
}

export function setUpload(id: string, patch: Partial<Manifest['upload']>): Manifest['upload'] {
  const m = readManifest(id);
  m.upload = { ...m.upload, ...patch };
  setStage(m, 'upload', 'in_progress');
  writeManifest(m);
  return m.upload;
}

export function setUploadYoutube(
  id: string,
  patch: Partial<Manifest['upload']['youtube']>
): Manifest['upload']['youtube'] {
  const m = readManifest(id);
  m.upload.youtube = { ...m.upload.youtube, ...patch };
  if (patch.status === 'completed') setStage(m, 'upload', 'completed');
  else if (patch.status === 'uploading') setStage(m, 'upload', 'in_progress');
  else if (patch.status === 'failed') setStage(m, 'upload', 'failed');
  writeManifest(m);
  return m.upload.youtube;
}

// ── Prompt templates (global) ────────────────────────────────────────────────

// Creative briefs that extend the master prompt (see lib/llm/prompt.ts). They
// govern tone/language/length only — the master prompt owns the JSON output
// structure (voiceover script + visual timeline).
const FACTS_RETENTION =
  'GOAL: Maximize retention, watch time, rewatchability, shares, and comments while staying 100% factually accurate.\n\n' +
  'CONTENT: Base it on a real modern scientific discovery, research finding, historical event, geography fact, technological advancement, natural phenomenon, psychology insight, expert-based future prediction, or a factually-backed mystery. No pseudoscience, conspiracy theories, or exaggerated/unsupported claims.\n\n' +
  'RETENTION & STORYTELLING:\n' +
  '- Curiosity-driven storytelling.\n' +
  '- The first 3 seconds must be an extremely strong hook that instantly opens a curiosity gap.\n' +
  '- Keep the viewer constantly feeling that an even more surprising fact is coming next.\n' +
  '- Introduce at least one major surprise or twist around the middle.\n' +
  "- Use open loops throughout; create at least one 'wait... what?' moment.\n" +
  '- The final 5 seconds must contain the most interesting information in the whole video.\n' +
  '- Include one fact people would naturally want to share with friends or family.\n' +
  '- End with a discussion-worthy question that encourages comments and opinions.';

const FACTS_VISUALS =
  'LENGTH: approximately 90-110 words, suitable for about 40 seconds of narration.\n\n' +
  'VISUAL DIRECTION: highly dynamic visuals that change every 3-4 seconds and directly support the narration - close-ups, maps, satellite imagery, scientific visuals, motion graphics, historical and news footage, nature footage, and dramatic zooms. Avoid generic stock visuals.';

const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'hindi-facts',
    name: 'Hindi Facts (Hinglish)',
    body:
      'You are writing for a Hindi facts channel in a natural Hinglish style (Hindi written in the Devanagari script, with common English words mixed in the way Indians actually speak). The video is a ~40 second YouTube Short.\n\n' +
      FACTS_RETENTION +
      '\n\nLANGUAGE: Write the narration in natural, spoken Hindi using the DEVANAGARI script. This is critical for audio quality: do NOT romanize — never write Hindi words in English/Latin letters (e.g. write "क्या आपको पता है", never "Kya aapko pata hai"). Keep it casual and conversational; it is fine to keep widely-used English words (science, planet, technology, internet, discover) in English where that sounds natural, but every Hindi word MUST be in Devanagari. Avoid hard, Sanskritized, poetic or textbook Hindi. Use short sentences and natural pauses (commas, ellipses ...). It must sound natural spoken by an ElevenLabs AI voice.\n\n' +
      FACTS_VISUALS
  },
  {
    id: 'english-facts',
    name: 'English Facts Channel',
    body:
      'You are writing for an English-language facts channel. The video is a ~40 second YouTube Short.\n\n' +
      FACTS_RETENTION +
      '\n\nLANGUAGE: Write in clear, conversational English with broad global appeal. Avoid jargon and overly complex words. Use short, punchy sentences and natural pauses (commas, ellipses ...). It must sound natural spoken by an ElevenLabs AI voice.\n\n' +
      FACTS_VISUALS
  }
];

export function listTemplates(): PromptTemplate[] {
  ensureBaseDirs();
  if (!existsSync(TEMPLATES_FILE)) {
    writeJson(TEMPLATES_FILE, DEFAULT_TEMPLATES);
    return DEFAULT_TEMPLATES;
  }
  return readJsonOr<PromptTemplate[]>(TEMPLATES_FILE, DEFAULT_TEMPLATES);
}

function saveTemplates(list: PromptTemplate[]) {
  writeJson(TEMPLATES_FILE, list);
}

export function createTemplate(name: string, body: string): PromptTemplate {
  const list = listTemplates();
  const tpl: PromptTemplate = {
    id: `${slugify(name)}-${shortId()}`,
    name: name.trim() || 'Untitled Template',
    body: body ?? ''
  };
  list.push(tpl);
  saveTemplates(list);
  return tpl;
}

export function updateTemplate(
  id: string,
  patch: { name?: string; body?: string }
): PromptTemplate {
  const list = listTemplates();
  const tpl = list.find((t) => t.id === id);
  if (!tpl) throw new HttpError(404, `Template "${id}" not found.`);
  if (typeof patch.name === 'string') tpl.name = patch.name;
  if (typeof patch.body === 'string') tpl.body = patch.body;
  saveTemplates(list);
  return tpl;
}

export function deleteTemplate(id: string) {
  const list = listTemplates();
  const next = list.filter((t) => t.id !== id);
  if (next.length === list.length) throw new HttpError(404, `Template "${id}" not found.`);
  saveTemplates(next);
}

// ── Stats (placeholder) ──────────────────────────────────────────────────────

export function getStats() {
  const workspaces = listWorkspaces();
  const videosGenerated = workspaces.filter((w) => w.stages.video.status === 'completed').length;
  const videosUploaded = workspaces.filter((w) => w.stages.upload.status === 'completed').length;
  return {
    workspaces: workspaces.length,
    videosGenerated,
    videosUploaded,
    totalViews: 0 // placeholder until upload analytics exist
  };
}

export { CONFIG_DIR };
