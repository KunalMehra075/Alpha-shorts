import { spawn } from 'node:child_process';
import { renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Engine modules (plain JS from the existing CLI pipeline).
import { generateAudio } from '../../../src/lib/elevenlabs.js';
import { getDuration } from '../../../src/lib/ffmpeg.js';
import { ensureDir } from './fsx';
import { projectDir } from './paths';
import {
  HttpError,
  addAudioVersion,
  audioDir,
  getCurrentScript,
  nextAudioVersion
} from './store';
import { findVoice } from './voices';
import type { AudioVersion } from './schema';

const DEFAULT_MODEL = 'eleven_multilingual_v2';
const OUTPUT_FORMAT = 'mp3_44100_128';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const clampSpeed = (n?: number) => Math.min(2, Math.max(1, n || 1));

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${stderr}`))));
  });
}

// Time-stretch an audio file in place using ffmpeg's atempo (pitch-preserving).
// Range 1–2x; a single atempo handles up to 2.0. No-op at 1x.
async function applySpeed(filePath: string, speed: number) {
  const s = clampSpeed(speed);
  if (s <= 1.001) return;
  const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
  const dot = filePath.lastIndexOf('.');
  const ext = dot > 0 ? filePath.slice(dot) : '.mp3';
  const tmp = `${dot > 0 ? filePath.slice(0, dot) : filePath}.spd${ext}`;
  try {
    await run(ffmpeg, ['-y', '-i', filePath, '-filter:a', `atempo=${s.toFixed(3)}`, tmp]);
    renameSync(tmp, filePath);
  } catch (err: any) {
    throw new HttpError(502, `Speed adjustment failed: ${err?.message ?? err}`);
  }
}

function elevenConfig(voiceId: string, stability: number, similarity: number) {
  return {
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY,
      voiceId,
      modelId: DEFAULT_MODEL,
      outputFormat: OUTPUT_FORMAT,
      voiceSettings: {
        stability: clamp01(stability / 100),
        similarityBoost: clamp01(similarity / 100),
        style: 0,
        useSpeakerBoost: true
      }
    }
  };
}

// Probe duration with ffprobe; fall back to a size-based estimate (~128 kbps).
async function probeDuration(filePath: string, fallbackBytes: number): Promise<number> {
  try {
    const sec = await getDuration(filePath, {
      video: { ffprobeBin: process.env.FFPROBE_BIN || 'ffprobe' }
    });
    return Math.round(sec * 10) / 10;
  } catch {
    return Math.max(1, Math.round((fallbackBytes / 16000) * 10) / 10);
  }
}

export async function generateTake(opts: {
  id: string;
  voiceId: string;
  stability: number;
  similarity: number;
  speed?: number;
}): Promise<AudioVersion> {
  const { id, voiceId, stability, similarity } = opts;
  const speed = clampSpeed(opts.speed);

  const script = getCurrentScript(id);
  const text = script?.voiceoverScript?.trim();
  if (!text) {
    throw new HttpError(400, 'No script to narrate yet — generate a script first.');
  }
  const voice = findVoice(voiceId);
  if (!voice) throw new HttpError(400, `Unknown voice "${voiceId}".`);
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new HttpError(400, 'ELEVENLABS_API_KEY is not set in the project .env.');
  }

  const version = nextAudioVersion(id);
  ensureDir(audioDir(id));
  const rel = `audio/v${version}.mp3`;
  const outPath = join(projectDir(id), rel);

  const t0 = Date.now();
  try {
    await generateAudio({ text, outPath, config: elevenConfig(voiceId, stability, similarity) });
  } catch (err: any) {
    throw new HttpError(502, `ElevenLabs generation failed: ${err?.message ?? err}`);
  }
  const genTimeSec = Math.round(((Date.now() - t0) / 1000) * 10) / 10;

  // Bake the chosen playback speed into the file (pitch-preserving).
  await applySpeed(outPath, speed);

  const sizeBytes = statSync(outPath).size;
  const durationSec = await probeDuration(outPath, sizeBytes);

  const take: AudioVersion = {
    version,
    voiceId,
    voiceName: voice.name,
    model: DEFAULT_MODEL,
    file: rel,
    durationSec,
    sizeBytes,
    genTimeSec,
    speed,
    source: 'generated',
    createdAt: new Date().toISOString()
  };
  addAudioVersion(id, take);
  return take;
}

export async function saveUploadedTake(opts: {
  id: string;
  buffer: Buffer;
  originalName: string;
  speed?: number;
}): Promise<AudioVersion> {
  const { id, buffer, originalName } = opts;
  const speed = clampSpeed(opts.speed);
  if (!buffer?.length) throw new HttpError(400, 'Empty upload.');

  const version = nextAudioVersion(id);
  ensureDir(audioDir(id));
  const ext = (originalName.match(/\.(mp3|wav|m4a|aac|ogg)$/i)?.[0] || '.mp3').toLowerCase();
  const rel = `audio/v${version}${ext}`;
  const outPath = join(projectDir(id), rel);
  writeFileSync(outPath, buffer);

  await applySpeed(outPath, speed);

  const sizeBytes = statSync(outPath).size;
  const durationSec = await probeDuration(outPath, sizeBytes);

  const take: AudioVersion = {
    version,
    voiceId: '',
    voiceName: 'Uploaded',
    model: '',
    file: rel,
    durationSec,
    sizeBytes,
    genTimeSec: 0,
    speed,
    source: 'uploaded',
    createdAt: new Date().toISOString()
  };
  addAudioVersion(id, take);
  return take;
}
