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
      'You are writing for a Hindi (Hinglish) facts channel. The video is a ~40 second YouTube Short.\n\n' +
      FACTS_RETENTION +
      '\n\nLANGUAGE: Write the narration in Devanagari Hindi while freely using common English words the way Indians naturally speak (Hinglish). Avoid difficult or Sanskritized Hindi, poetic or textbook wording. Use short sentences and natural pauses (commas, ellipses ...). It must sound natural spoken by an ElevenLabs AI voice.\n\n' +
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
