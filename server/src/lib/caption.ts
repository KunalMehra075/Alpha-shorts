import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
// Engine modules (plain JS from the CLI pipeline).
import { buildAss, maskStyle } from '../../../src/lib/ass-generator.js';
import { getDuration, renderOverlay } from '../../../src/lib/ffmpeg.js';
import { ensureDir } from './fsx';
import { workspaceDir } from './paths';
import { HttpError, captionsDir, getAudioState, getCaptions, setCaptions } from './store';
import type { CaptionLine, CaptionSettings } from './schema';

type Word = { word: string; start: number; end: number };

const WORDS_PER_LINE = 4;

// ── Whisper ──────────────────────────────────────────────────────────────────

function whisperConfig(language: string) {
  // en -> base, hi/bilingual -> small (base mis-transcribes Hindi script).
  if (language === 'hi') return { model: 'small', lang: 'hi' };
  if (language === 'bilingual') return { model: 'small', lang: '' }; // auto-detect
  return { model: 'base', lang: 'en' };
}

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err: any) => {
      reject(
        err.code === 'ENOENT'
          ? new Error(`Could not find Whisper ("${cmd}"). Install openai-whisper or whisper-ctranslate2.`)
          : err
      );
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${stderr}`))));
  });
}

function extractWords(data: any): Word[] {
  const words: Word[] = [];
  for (const seg of data.segments || []) {
    for (const w of seg.words || []) {
      const text = (w.word ?? w.text ?? '').trim();
      if (!text) continue;
      if (typeof w.start !== 'number' || typeof w.end !== 'number') continue;
      words.push({ word: text, start: w.start, end: Math.max(w.end, w.start) });
    }
  }
  return words;
}

async function transcribe(audioPath: string, outDir: string, language: string, force: boolean): Promise<Word[]> {
  const bin = process.env.WHISPER_BIN || 'whisper';
  const { model, lang } = whisperConfig(language);
  const jsonPath = join(outDir, `${basename(audioPath, extname(audioPath))}.json`);

  if (force || !existsSync(jsonPath)) {
    const args = [
      audioPath,
      '--model', model,
      '--word_timestamps', 'True',
      '--output_format', 'json',
      '--output_dir', outDir,
      '--verbose', 'False'
    ];
    if (lang) args.push('--language', lang);
    await run(bin, args);
    if (!existsSync(jsonPath)) {
      throw new Error(`Whisper did not produce a transcript at ${jsonPath}`);
    }
  }

  const words = extractWords(JSON.parse(readFileSync(jsonPath, 'utf8')));
  if (words.length === 0) {
    throw new Error('No word-level timestamps found. Ensure Whisper supports --word_timestamps.');
  }
  return words;
}

// ── Caption data ──────────────────────────────────────────────────────────────

function groupLines(words: Word[]): CaptionLine[] {
  const lines: CaptionLine[] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
    const chunk = words.slice(i, i + WORDS_PER_LINE);
    lines.push({
      id: lines.length,
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      text: chunk.map((w) => w.word).join(' ')
    });
  }
  return lines;
}

function srtTime(t: number) {
  const total = Math.max(0, t);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

function toSrt(lines: CaptionLine[]): string {
  return (
    lines
      .map((l, i) => `${i + 1}\n${srtTime(l.start)} --> ${srtTime(l.end)}\n${l.text}`)
      .join('\n\n') + '\n'
  );
}

// Map dashboard caption settings to the engine's ASS style object.
function engineStyle(settings: CaptionSettings) {
  return {
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    textColor: settings.textColor,
    highlightColor: settings.highlightColor,
    strokeColor: settings.strokeColor,
    strokeWidth: settings.strokeWidth,
    shadowColor: '#000000',
    shadowBlur: 0,
    position: settings.position,
    bottomPadding: 220,
    lineSpacing: 12,
    uppercase: settings.uppercase,
    bold: settings.fontWeight >= 700,
    maxWordsPerLine: WORDS_PER_LINE,
    animation: { enter: 'pop', exit: 'pop', enterDuration: 120, exitDuration: 90 }
  };
}

function videoConfig(background: 'transparent' | 'greenscreen') {
  return {
    ffmpegBin: process.env.FFMPEG_BIN || 'ffmpeg',
    ffprobeBin: process.env.FFPROBE_BIN || 'ffprobe',
    width: 1080,
    height: 1920,
    fps: 30,
    background,
    codec: 'prores_ks',
    proresProfile: '4444',
    pixelFormat: 'yuva444p10le',
    greenColor: '#00FF00',
    greenCrf: 18
  };
}

function currentAudioPath(id: string): string {
  const audio = getAudioState(id);
  if (audio.currentVersion == null) {
    throw new HttpError(400, 'No audio yet — generate narration in the Audio tab first.');
  }
  const take = audio.versions.find((v) => v.version === audio.currentVersion)!;
  return join(workspaceDir(id), take.file);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateCaptions(opts: {
  id: string;
  language: string;
  settings: CaptionSettings;
  force?: boolean;
}) {
  const { id, language, settings, force = false } = opts;
  const audioPath = currentAudioPath(id);
  const dir = captionsDir(id);
  ensureDir(dir);

  const words = await transcribe(audioPath, dir, language, force);
  const lines = groupLines(words);

  writeFileSync(join(dir, 'words.json'), JSON.stringify(words, null, 2));
  writeFileSync(join(dir, 'captions.srt'), toSrt(lines));
  writeFileSync(
    join(dir, 'caption.json'),
    JSON.stringify({ language, settings, lines, words }, null, 2)
  );

  setCaptions(
    id,
    {
      language,
      settings,
      hasTranscript: true,
      wordsCount: words.length,
      lines,
      files: { json: 'captions/caption.json', srt: 'captions/captions.srt', words: 'captions/words.json' }
    },
    'completed'
  );

  return getCaptionsState(id);
}

export function saveCaptions(opts: { id: string; settings: CaptionSettings; lines: CaptionLine[] }) {
  const { id, settings, lines } = opts;
  const dir = captionsDir(id);
  ensureDir(dir);

  // Refresh text exports from the edited lines.
  writeFileSync(join(dir, 'captions.srt'), toSrt(lines));
  const wordsPath = join(dir, 'words.json');
  const words = existsSync(wordsPath) ? JSON.parse(readFileSync(wordsPath, 'utf8')) : [];
  writeFileSync(
    join(dir, 'caption.json'),
    JSON.stringify({ settings, lines, words }, null, 2)
  );

  setCaptions(id, { settings, lines });
  return getCaptionsState(id);
}

export async function renderCaptionOverlay(opts: {
  id: string;
  background: 'transparent' | 'greenscreen';
}) {
  const { id, background } = opts;
  const dir = captionsDir(id);
  const wordsPath = join(dir, 'words.json');
  if (!existsSync(wordsPath)) {
    throw new HttpError(400, 'Generate captions first.');
  }
  const words: Word[] = JSON.parse(readFileSync(wordsPath, 'utf8'));
  const caps = getCaptionsState(id);
  const audioPath = currentAudioPath(id);

  const style = engineStyle(caps.settings);
  const video = videoConfig(background);
  const assPath = join(dir, 'overlay.ass');
  const maskPath = join(dir, 'overlay.mask.ass');
  writeFileSync(assPath, buildAss(words, style, video));
  writeFileSync(maskPath, buildAss(words, maskStyle(style), video));

  const ext = background === 'greenscreen' ? '.mp4' : '.mov';
  const rel = `captions/overlay${ext}`;
  const outPath = join(workspaceDir(id), rel);

  let durationSec: number;
  try {
    durationSec = await getDuration(audioPath, { video });
  } catch {
    durationSec = caps.lines.at(-1)?.end ?? 10;
  }

  try {
    await renderOverlay({ assPath, maskPath, outPath, durationSec, config: { video } });
  } catch (err: any) {
    throw new HttpError(502, `Overlay render failed: ${err?.message ?? err}`);
  }

  const overlay = { file: rel, background, durationSec, createdAt: new Date().toISOString() };
  setCaptions(id, { overlay });
  return overlay;
}

function getCaptionsState(id: string) {
  return getCaptions(id);
}
