import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
// Engine modules (plain JS from the CLI pipeline).
import { buildAss } from '../../../src/lib/ass-generator.js';
import { getDuration } from '../../../src/lib/ffmpeg.js';
import { ensureDir } from './fsx';
import { projectDir } from './paths';
import {
  HttpError,
  captionsDir,
  getAudioState,
  getCaptions,
  getCurrentScript,
  getScenes,
  setCaptions,
  setScenes
} from './store';
import { defaultScriptGenerator } from './llm';
import type { CaptionLine, CaptionSettings } from './schema';

const captionGenerator = defaultScriptGenerator();

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

// ── Fix captions from the script (Option A: alignment, Option B: AI fallback) ──

// Normalize a token for comparison (lowercase, drop punctuation; Unicode-aware).
function normToken(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function similarity(a: string, b: string): number {
  const x = normToken(a);
  const y = normToken(b);
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/**
 * Option A — align the ground-truth script tokens to the Whisper word timings via
 * Needleman–Wunsch, emitting one corrected word per SCRIPT token (text from the
 * script, timestamp from the matched Whisper word; gaps interpolated). Returns the
 * corrected words plus how many script tokens matched a Whisper word (confidence).
 */
function alignScriptToWords(scriptToks: string[], words: Word[]): { words: Word[]; matched: number } {
  const S = scriptToks.length;
  const W = words.length;
  const GAP = -0.6;
  const score: number[][] = Array.from({ length: S + 1 }, () => new Array(W + 1).fill(0));
  const ptr: number[][] = Array.from({ length: S + 1 }, () => new Array(W + 1).fill(0)); // 0 diag, 1 up (script-only), 2 left (whisper-only)
  for (let i = 1; i <= S; i++) {
    score[i][0] = score[i - 1][0] + GAP;
    ptr[i][0] = 1;
  }
  for (let j = 1; j <= W; j++) {
    score[0][j] = score[0][j - 1] + GAP;
    ptr[0][j] = 2;
  }
  for (let i = 1; i <= S; i++) {
    for (let j = 1; j <= W; j++) {
      const sim = similarity(scriptToks[i - 1], words[j - 1].word);
      const diag = score[i - 1][j - 1] + (sim * 2 - 0.5); // reward similar tokens
      const up = score[i - 1][j] + GAP;
      const left = score[i][j - 1] + GAP;
      let best = diag;
      let p = 0;
      if (up > best) {
        best = up;
        p = 1;
      }
      if (left > best) {
        best = left;
        p = 2;
      }
      score[i][j] = best;
      ptr[i][j] = p;
    }
  }

  // Traceback into aligned pairs.
  const aligned: { s?: string; w?: Word }[] = [];
  let i = S;
  let j = W;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ptr[i][j] === 0) {
      aligned.push({ s: scriptToks[i - 1], w: words[j - 1] });
      i--;
      j--;
    } else if (i > 0 && (j === 0 || ptr[i][j] === 1)) {
      aligned.push({ s: scriptToks[i - 1] });
      i--;
    } else {
      aligned.push({ w: words[j - 1] });
      j--;
    }
  }
  aligned.reverse();

  // Emit one timed word per script token; interpolate runs that Whisper missed.
  const out: Word[] = [];
  let matched = 0;
  let pending: string[] = [];
  let lastEnd = 0;
  const lastWordEnd = W ? words[W - 1].end : 0;
  const flushPending = (nextStart: number) => {
    if (!pending.length) return;
    const span = Math.max(0.01, nextStart - lastEnd);
    const each = span / pending.length;
    pending.forEach((tok, k) => out.push({ word: tok, start: lastEnd + each * k, end: lastEnd + each * (k + 1) }));
    lastEnd = nextStart;
    pending = [];
  };
  for (const a of aligned) {
    if (a.s && a.w) {
      flushPending(a.w.start);
      out.push({ word: a.s, start: a.w.start, end: a.w.end });
      lastEnd = a.w.end;
      matched++;
    } else if (a.s) {
      pending.push(a.s); // script token Whisper missed → interpolate later
    }
    // a.w only (Whisper insertion / hallucination) → dropped
  }
  flushPending(Math.max(lastEnd + 0.3, lastWordEnd));
  return { words: out, matched };
}

// Derive word-level timings from corrected line texts (Option B), splitting each
// line's text evenly across its [start, end] span.
function wordsFromCorrectedLines(lines: CaptionLine[], texts: string[]): Word[] {
  const out: Word[] = [];
  lines.forEach((ln, i) => {
    const toks = (texts[i] ?? ln.text).trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return;
    const dur = Math.max(0.2, ln.end - ln.start);
    const per = dur / toks.length;
    toks.forEach((t, k) => out.push({ word: t, start: ln.start + per * k, end: ln.start + per * (k + 1) }));
  });
  return out;
}

/**
 * One-click caption correction. Replaces the captions in place (re-chunked to the
 * current words-per-line) and clears the now-stale overlay. Two paths:
 *  - WITH a script: Option A snaps the script words onto the Whisper word timings
 *    (perfect spelling, timings preserved); if alignment is low-confidence and a
 *    real LLM is configured, Option B corrects the lines via the model instead.
 *  - WITHOUT a script: an LLM fixes spelling/punctuation from the captions' own
 *    context (no script reference), preserving every word, order and timing.
 * Requires an existing transcript (and, for the no-script path, a real LLM).
 */
export async function fixCaptions(
  id: string
): Promise<{ state: ReturnType<typeof getCaptionsState>; method: 'align' | 'ai'; corrected: number }> {
  const script = getCurrentScript(id)?.voiceoverScript?.trim() || '';
  const caps = getCaptionsState(id);
  if (!caps.hasTranscript) throw new HttpError(400, 'Generate captions first.');
  const words = readWords(id);
  if (!words.length) throw new HttpError(400, 'No transcript words found — re-generate captions first.');

  const aiAvailable = captionGenerator.available().some((n) => n !== 'mock');

  let finalWords: Word[];
  let method: 'align' | 'ai';

  if (script) {
    // Option A — deterministic alignment to the ground-truth script.
    const scriptToks = script.split(/\s+/).filter(Boolean);
    const a = alignScriptToWords(scriptToks, words);
    const matchRatio = scriptToks.length ? a.matched / scriptToks.length : 0;
    const lenRatio = words.length ? scriptToks.length / words.length : 0;
    const aConfident = matchRatio >= 0.6 && lenRatio >= 0.5 && lenRatio <= 2;

    finalWords = a.words;
    method = 'align';

    // Option B fallback — only when A is shaky AND a real (non-mock) LLM exists.
    if (!aConfident && aiAvailable && caps.lines.length > 0) {
      try {
        const r = await captionGenerator.runFixCaptions({
          script,
          lines: caps.lines.map((l) => l.text),
          language: caps.language
        });
        if (!r.mock && r.lines.length === caps.lines.length) {
          finalWords = wordsFromCorrectedLines(caps.lines, r.lines);
          method = 'ai';
        }
      } catch {
        /* keep Option A's result */
      }
    }
  } else {
    // No script → context-based AI spell-fix (requires a real LLM).
    if (!aiAvailable) {
      throw new HttpError(
        400,
        'No script and no AI provider configured. Add an API key (or write a script) to fix captions.'
      );
    }
    if (!caps.lines.length) throw new HttpError(400, 'No caption lines to fix.');
    const r = await captionGenerator.runFixCaptions({
      script: '', // signals context-only mode to the prompt
      lines: caps.lines.map((l) => l.text),
      language: caps.language
    });
    if (r.mock || r.lines.length !== caps.lines.length) {
      throw new HttpError(502, 'AI caption fix did not return a usable result — please try again.');
    }
    finalWords = wordsFromCorrectedLines(caps.lines, r.lines);
    method = 'ai';
  }

  // Count corrected tokens (normalized comparison vs the original Whisper words).
  const beforeNorm = words.map((w) => normToken(w.word));
  const afterNorm = finalWords.map((w) => normToken(w.word));
  let corrected = 0;
  const n = Math.max(beforeNorm.length, afterNorm.length);
  for (let k = 0; k < n; k++) {
    if (beforeNorm[k] !== afterNorm[k]) corrected++;
  }

  // Re-chunk + persist in place; drop the stale overlay (text changed).
  const perLine = clampWordsPerLine(caps.settings.wordsPerLine);
  const lines = groupLines(finalWords, perLine);
  const dir = captionsDir(id);
  ensureDir(dir);
  writeFileSync(join(dir, 'words.json'), JSON.stringify(finalWords, null, 2));
  writeFileSync(join(dir, 'captions.srt'), toSrt(lines));
  writeFileSync(
    join(dir, 'caption.json'),
    JSON.stringify({ language: caps.language, settings: caps.settings, lines, words: finalWords }, null, 2)
  );
  setCaptions(id, { lines, wordsCount: finalWords.length, overlay: null });

  return { state: getCaptionsState(id), method, corrected };
}
