import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { customAlphabet } from 'nanoid';
// Engine module (ffprobe duration).
import { getDuration } from '../../../src/lib/ffmpeg.js';
import { ensureDir, existsSync, readJsonOr, removePath, writeJson } from './fsx';
import { ROOT, workspaceDir } from './paths';
import { HttpError, addSoundPlacement, soundsDir as wsSoundsDir } from './store';

const shortId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

// Global, app-level sound library (shared across all workspaces).
export const GLOBAL_SOUNDS_DIR = join(ROOT, 'sounds');
const SAMPLES_DIR = join(GLOBAL_SOUNDS_DIR, 'samples');
const INDEX = join(GLOBAL_SOUNDS_DIR, 'library.json');
const AUDIO_RE = /\.(mp3|wav|m4a|aac|ogg)$/i;

export type SoundItem = {
  id: string;
  name: string;
  file: string; // relative to GLOBAL_SOUNDS_DIR
  durationSec: number;
  sizeBytes: number;
  createdAt: string;
};

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${stderr}`))));
  });
}

async function probe(path: string): Promise<number> {
  try {
    const s = await getDuration(path, { video: { ffprobeBin: process.env.FFPROBE_BIN || 'ffprobe' } });
    return Math.round(s * 10) / 10;
  } catch {
    return 0;
  }
}

// Generate a handful of short placeholder sounds (sine tones with fades) so the
// library isn't empty before the user adds their own. Best-effort.
async function seedSamples(): Promise<SoundItem[]> {
  const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
  mkdirSync(SAMPLES_DIR, { recursive: true });
  const specs = [
    { name: 'Pop.mp3', freq: 700, dur: 0.18 },
    { name: 'Click.mp3', freq: 1000, dur: 0.09 },
    { name: 'Boop.mp3', freq: 440, dur: 0.25 },
    { name: 'Ding.mp3', freq: 1320, dur: 0.6 },
    { name: 'Chime.mp3', freq: 880, dur: 0.9 }
  ];
  const out: SoundItem[] = [];
  for (const s of specs) {
    const id = shortId();
    const rel = `samples/${id}.mp3`;
    const abs = join(GLOBAL_SOUNDS_DIR, rel);
    const fadeOutSt = Math.max(0, s.dur * 0.6).toFixed(2);
    const fadeOutD = Math.max(0.02, s.dur * 0.4).toFixed(2);
    try {
      await run(ffmpeg, [
        '-y', '-f', 'lavfi', '-i', `sine=frequency=${s.freq}:duration=${s.dur}`,
        '-af', `afade=t=in:d=0.01,afade=t=out:st=${fadeOutSt}:d=${fadeOutD}`,
        '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '5', abs
      ]);
      out.push({
        id,
        name: s.name,
        file: rel,
        durationSec: Math.round(s.dur * 10) / 10,
        sizeBytes: 0,
        createdAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.warn(`[sounds] sample "${s.name}" generation failed: ${err?.message ?? err}`);
    }
  }
  return out;
}

// Read the library; seed sample sounds once on first ever access.
export async function getSoundLibrary(): Promise<SoundItem[]> {
  if (existsSync(INDEX)) return readJsonOr<SoundItem[]>(INDEX, []);
  ensureDir(GLOBAL_SOUNDS_DIR);
  const seeded = await seedSamples().catch((e) => {
    console.warn(`[sounds] seeding failed: ${e?.message ?? e}`);
    return [] as SoundItem[];
  });
  writeJson(INDEX, seeded); // write even if empty so we never re-seed
  return seeded;
}

export async function addSound(opts: { buffer: Buffer; originalName: string }): Promise<SoundItem> {
  const { buffer, originalName } = opts;
  if (!buffer?.length) throw new HttpError(400, 'Empty upload.');
  if (!AUDIO_RE.test(originalName)) throw new HttpError(400, `"${originalName}" isn't an audio file.`);
  await getSoundLibrary(); // ensure index/dir exist
  ensureDir(GLOBAL_SOUNDS_DIR);
  const id = shortId();
  const ext = (originalName.match(/\.[A-Za-z0-9]+$/)?.[0] || '.mp3').toLowerCase();
  const rel = `${id}${ext}`;
  writeFileSync(join(GLOBAL_SOUNDS_DIR, rel), buffer);
  const item: SoundItem = {
    id,
    name: originalName,
    file: rel,
    durationSec: await probe(join(GLOBAL_SOUNDS_DIR, rel)),
    sizeBytes: buffer.length,
    createdAt: new Date().toISOString()
  };
  const lib = readJsonOr<SoundItem[]>(INDEX, []);
  lib.unshift(item);
  writeJson(INDEX, lib);
  return item;
}

export function deleteSound(id: string): SoundItem[] {
  const lib = readJsonOr<SoundItem[]>(INDEX, []);
  const it = lib.find((x) => x.id === id);
  if (!it) throw new HttpError(404, `Sound "${id}" not found.`);
  removePath(join(GLOBAL_SOUNDS_DIR, it.file));
  const next = lib.filter((x) => x.id !== id);
  writeJson(INDEX, next);
  return next;
}

// Place a global sound onto a workspace's video timeline (copy-on-place).
export async function placeSound(opts: { id: string; soundId: string; atSec: number }) {
  const { id, soundId, atSec } = opts;
  const snd = (await getSoundLibrary()).find((s) => s.id === soundId);
  if (!snd) throw new HttpError(404, `Sound "${soundId}" not found.`);
  ensureDir(wsSoundsDir(id));
  const pid = shortId();
  const ext = extname(snd.file) || '.mp3';
  const rel = `sounds/${pid}${ext}`;
  copyFileSync(join(GLOBAL_SOUNDS_DIR, snd.file), join(workspaceDir(id), rel));
  const rec = {
    id: pid,
    name: snd.name,
    file: rel,
    atSec: Math.max(0, Math.round(atSec * 100) / 100),
    durationSec: snd.durationSec,
    volume: 1
  };
  addSoundPlacement(id, rec);
  return rec;
}
