import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Engine modules (plain JS from the existing CLI pipeline).
import { generateAudio } from '../../../src/lib/elevenlabs.js';
import { getDuration } from '../../../src/lib/ffmpeg.js';
import { ensureDir } from './fsx';
import { workspaceDir } from './paths';
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
}): Promise<AudioVersion> {
  const { id, voiceId, stability, similarity } = opts;

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
  const outPath = join(workspaceDir(id), rel);

  const t0 = Date.now();
  try {
    await generateAudio({ text, outPath, config: elevenConfig(voiceId, stability, similarity) });
  } catch (err: any) {
    throw new HttpError(502, `ElevenLabs generation failed: ${err?.message ?? err}`);
  }
  const genTimeSec = Math.round(((Date.now() - t0) / 1000) * 10) / 10;

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
}): Promise<AudioVersion> {
  const { id, buffer, originalName } = opts;
  if (!buffer?.length) throw new HttpError(400, 'Empty upload.');

  const version = nextAudioVersion(id);
  ensureDir(audioDir(id));
  const ext = (originalName.match(/\.(mp3|wav|m4a|aac|ogg)$/i)?.[0] || '.mp3').toLowerCase();
  const rel = `audio/v${version}${ext}`;
  const outPath = join(workspaceDir(id), rel);
  writeFileSync(outPath, buffer);

  const sizeBytes = buffer.length;
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
    source: 'uploaded',
    createdAt: new Date().toISOString()
  };
  addAudioVersion(id, take);
  return take;
}
