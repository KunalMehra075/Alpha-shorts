import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
// Engine modules (plain JS from the CLI pipeline).
import { buildAss } from '../../../src/lib/ass-generator.js';
import { getDuration } from '../../../src/lib/ffmpeg.js';
import { ensureDir } from './fsx';
import { projectDir } from './paths';
import { HttpError, captionsDir, getAudioState, getCaptions, getScenes, setCaptions, setScenes } from './store';
import type { CaptionLine, CaptionSettings } from './schema';

type Word = { word: string; start: number; end: number };

const DEFAULT_WORDS_PER_LINE = 4;
const clampWordsPerLine = (n?: number) => Math.min(5, Math.max(2, n || DEFAULT_WORDS_PER_LINE));

// ── Whisper ──────────────────────────────────────────────────────────────────

function whisperConfig(language: string) {
  // en -> base, hi/bilingual -> small (base mis-transcribes Hindi script).
  if (language === 'hi') return { model: 'small', lang: 'hi' };
  if (language === 'bilingual') return { model: 'small', lang: '' }; // auto-detect
  return { model: 'base', lang: 'en' };
}

function run(cmd: string, args: string[], cwd?: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
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

function groupLines(words: Word[], perLine: number): CaptionLine[] {
  const lines: CaptionLine[] = [];
  for (let i = 0; i < words.length; i += perLine) {
    const chunk = words.slice(i, i + perLine);
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
    positionY: settings.positionY, // 0 = top, 100 = bottom
    lineSpacing: 12,
    uppercase: settings.uppercase,
    bold: settings.fontWeight >= 700,
    maxWordsPerLine: clampWordsPerLine(settings.wordsPerLine),
    animation: { enter: 'pop', exit: 'pop', enterDuration: 120, exitDuration: 90 }
  };
}

// Convert "#RRGGBB" -> "0xRRGGBB" for ffmpeg's color source.
function ffColor(hex: string) {
  return `0x${hex.replace('#', '').trim().toUpperCase()}`;
}

/**
 * Render captions on a solid background color into a web-playable H.264 .mp4,
 * with the narration audio muxed in so it plays in-browser exactly as it will
 * sound. The .ass is staged to a temp dir with an ASCII-safe name because the
 * libass filtergraph can't reference paths with spaces (the project path has one).
 */
async function renderColorMp4(opts: {
  assPath: string;
  bgHex: string;
  audioPath: string;
  outPath: string;
  durationSec: number;
}) {
  const { assPath, bgHex, audioPath, outPath, durationSec } = opts;
  const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';

  const safe = basename(outPath).replace(/[^A-Za-z0-9]+/g, '_') || 'cap';
  const dir = tmpdir();
  const stagedName = `cap_${process.pid}_${safe}.ass`;
  const staged = join(dir, stagedName);
  copyFileSync(assPath, staged);

  const source = `color=c=${ffColor(bgHex)}:s=1080x1920:r=30:d=${durationSec.toFixed(3)}`;
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', source,
    '-i', audioPath,
    '-vf', `ass=${stagedName}`,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', outPath
  ];

  try {
    await run(ffmpeg, args, dir);
  } finally {
    rmSync(staged, { force: true });
  }
}

function currentAudioPath(id: string): string {
  const audio = getAudioState(id);
  if (audio.currentVersion == null) {
    throw new HttpError(400, 'No audio yet — generate narration in the Audio tab first.');
  }
  const take = audio.versions.find((v) => v.version === audio.currentVersion)!;
  return join(projectDir(id), take.file);
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
  const lines = groupLines(words, clampWordsPerLine(settings.wordsPerLine));

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
      // A forced re-transcribe (e.g. language change) invalidates any previously
      // rendered overlay — drop it so the stale-language preview isn't shown.
      ...(force ? { overlay: null } : {}),
      files: { json: 'captions/caption.json', srt: 'captions/captions.srt', words: 'captions/words.json' }
    },
    'completed'
  );

  // Now that fresh word timestamps exist, re-sync any existing scene breakdown to
  // the narration (no-op if no scenes have been built yet).
  await retimeScenesToAudio(id);

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

/**
 * Render the caption overlay as two web-playable .mp4s — "normal" (on black) and
 * "greenscreen" (on green) — each with the project's current narration audio
 * muxed in, so they preview in-browser exactly as they'll sound. Requires both a
 * transcript and generated audio.
 */
// Build karaoke words from the (possibly hand-edited) caption lines, splitting
// each line's text across its [start,end] so the highlight still moves word by
// word. This makes the editable caption boxes the source of truth for the video.
function wordsFromLines(lines: CaptionLine[]): Word[] {
  const out: Word[] = [];
  for (const line of lines) {
    const toks = line.text.trim().split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    const dur = Math.max(0.2, line.end - line.start);
    const per = dur / toks.length;
    toks.forEach((t, i) => {
      const start = line.start + per * i;
      out.push({ word: t, start, end: start + per });
    });
  }
  return out;
}

export async function renderCaptionOverlay(opts: { id: string }) {
  const { id } = opts;
  const dir = captionsDir(id);
  const caps = getCaptionsState(id);
  if (!caps.hasTranscript) {
    throw new HttpError(400, 'Generate captions first.');
  }
  const audioPath = currentAudioPath(id); // 400 if no audio yet

  // Prefer the edited caption lines; fall back to raw Whisper words.
  let words: Word[] = wordsFromLines(caps.lines);
  if (!words.length) {
    const wordsPath = join(dir, 'words.json');
    if (existsSync(wordsPath)) words = JSON.parse(readFileSync(wordsPath, 'utf8'));
  }
  if (!words.length) throw new HttpError(400, 'No caption words to render.');

  const style = engineStyle(caps.settings);
  const assPath = join(dir, 'overlay.ass');
  writeFileSync(assPath, buildAss(words, style, { width: 1080, height: 1920 }));

  let durationSec: number;
  try {
    durationSec = await getDuration(audioPath, {
      video: { ffprobeBin: process.env.FFPROBE_BIN || 'ffprobe' }
    });
  } catch {
    durationSec = caps.lines.at(-1)?.end ?? 10;
  }

  const normalRel = 'captions/overlay-normal.mp4';
  const greenRel = 'captions/overlay-green.mp4';
  const normalPath = join(projectDir(id), normalRel);
  const greenPath = join(projectDir(id), greenRel);

  try {
    await renderColorMp4({ assPath, bgHex: '#000000', audioPath, outPath: normalPath, durationSec });
    await renderColorMp4({ assPath, bgHex: '#00FF00', audioPath, outPath: greenPath, durationSec });
  } catch (err: any) {
    throw new HttpError(502, `Overlay render failed: ${err?.message ?? err}`);
  }

  const overlay = {
    createdAt: new Date().toISOString(),
    durationSec,
    hasAudio: true,
    normal: { file: normalRel, sizeBytes: statSync(normalPath).size },
    green: { file: greenRel, sizeBytes: statSync(greenPath).size }
  };
  setCaptions(id, { overlay });
  return overlay;
}

function getCaptionsState(id: string) {
  return getCaptions(id);
}

// ── Sync scene timings to the narration ───────────────────────────────────────

function readWords(id: string): Word[] {
  const p = join(captionsDir(id), 'words.json');
  if (!existsSync(p)) return [];
  try {
    const arr = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(arr)
      ? arr.filter((w) => typeof w?.start === 'number' && typeof w?.end === 'number')
      : [];
  } catch {
    return [];
  }
}

const tokenCount = (s: string) => (s || '').trim().split(/\s+/).filter(Boolean).length;

/**
 * Re-time the NARRATION scenes (those with a spokenLine) to the real audio so the
 * breakdown total matches the narration length, with cuts on actual word
 * boundaries. The mapping is proportional to each scene's word count over the
 * Whisper word timestamps (robust to ASR/tokenization mismatch); the very last
 * narration scene is pinned to the audio's true end.
 *
 * Scenes WITHOUT a spokenLine — manually added extras (which may carry their own
 * audio) — are left untouched and simply add their own length on top, so a
 * narration of 0:57 plus an extra clip yields a longer video by design. Uses raw
 * word timestamps (words.json), NOT caption lines, so the caption granularity
 * (words-per-line) has no effect on scene count or timing. No-op when there's no
 * audio yet (e.g. breakdown built from the script before narration exists).
 */
export async function retimeScenesToAudio(id: string): Promise<boolean> {
  const scenes = getScenes(id);
  if (!scenes.length) return false;
  const narration = scenes.filter((s) => (s.spokenLine ?? '').trim().length > 0);
  if (!narration.length) return false;

  // Need the audio; bail (keep existing estimates) if narration isn't generated.
  let audioPath: string;
  try {
    audioPath = currentAudioPath(id);
  } catch {
    return false;
  }

  const words = readWords(id);
  let audioDur = words.length ? words[words.length - 1].end : 0;
  try {
    const d = await getDuration(audioPath, { video: { ffprobeBin: process.env.FFPROBE_BIN || 'ffprobe' } });
    if (d > 0) audioDur = d;
  } catch {
    /* fall back to the last word's end */
  }
  if (!(audioDur > 0)) return false;

  const totalTokens = narration.reduce((sum, s) => sum + Math.max(1, tokenCount(s.spokenLine)), 0);
  const L = words.length;

  let prevCut = 0;
  let consumed = 0;
  let wordPtr = 0;
  narration.forEach((s, k) => {
    consumed += Math.max(1, tokenCount(s.spokenLine));
    let end: number;
    if (k === narration.length - 1) {
      end = audioDur; // pin the final scene to the true audio end
    } else if (L > 0) {
      // Cut on the nearest real word boundary for this scene's token share.
      let idx = Math.round((consumed / totalTokens) * L) - 1;
      if (idx < wordPtr) idx = wordPtr;
      if (idx > L - 1) idx = L - 1;
      end = words[idx].end;
      wordPtr = idx + 1;
    } else {
      // Audio but no word timestamps → distribute proportionally by tokens.
      end = audioDur * (consumed / totalTokens);
    }
    const dur = Math.max(0.5, Math.round((end - prevCut) * 100) / 100);
    // Encode the duration; setScenes reflows contiguous start/end across all
    // scenes (extras included), so interspersed extras keep their own length.
    s.start = 0;
    s.end = dur;
    prevCut += dur;
  });

  setScenes(id, scenes);
  return true;
}
