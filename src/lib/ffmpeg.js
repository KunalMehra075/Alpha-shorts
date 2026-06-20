import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

let _assFilterCache;

/**
 * Check whether this FFmpeg build has the `ass` filter (i.e. was compiled with
 * libass). Many minimal/custom builds omit it. Returns true/false.
 */
export function hasAssFilter(ffmpegBin = 'ffmpeg') {
  if (_assFilterCache !== undefined) return _assFilterCache;
  const res = spawnSync(ffmpegBin, ['-hide_banner', '-filters'], {
    encoding: 'utf8'
  });
  const out = `${res.stdout || ''}`;
  // `ffmpeg -filters` lines look like: " ... ass  V->V  Render ASS subtitles".
  // The filter name is the second whitespace-delimited token.
  _assFilterCache = out
    .split('\n')
    .some((line) => line.trim().split(/\s+/)[1] === 'ass');
  return _assFilterCache;
}

/** Throw a clear, actionable error if the ass filter is unavailable. */
export function assertAssFilter(ffmpegBin = 'ffmpeg') {
  if (hasAssFilter(ffmpegBin)) return;
  throw new Error(
    `Your FFmpeg ("${ffmpegBin}") was built WITHOUT libass, so it cannot render ` +
      'ASS subtitles (no "ass" filter). Install an FFmpeg that includes libass:\n' +
      '  macOS:  brew install ffmpeg-full  (the regular "ffmpeg" formula omits libass)\n' +
      '          then set FFMPEG_BIN/FFPROBE_BIN to /opt/homebrew/opt/ffmpeg-full/bin/...\n' +
      '  Ubuntu: sudo apt install ffmpeg\n' +
      '  Or download a full build from https://ffmpeg.org/download.html\n' +
      'Verify with: ffmpeg -filters | grep " ass "'
  );
}

function run(cmd, args, { cwd, logger } = {}) {
  return new Promise((resolve, reject) => {
    logger?.debug(`exec: ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      logger?.debug(text.trimEnd());
    });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            `Could not find "${cmd}". Is FFmpeg installed and on your PATH? ` +
              `Install with: brew install ffmpeg (macOS) or see the README.`
          )
        );
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with code ${code}\n${stderr}`));
    });
  });
}

/**
 * Extract the audio track of a video file to an MP3.
 * Paths are passed as separate args (no filtergraph), so spaces/special
 * characters in either path are handled safely.
 */
export async function extractAudio({ videoPath, outPath, config, logger }) {
  const { ffmpegBin } = config.video;
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'warning',
    '-i',
    videoPath,
    '-vn', // drop the video stream
    '-c:a',
    'libmp3lame',
    '-q:a',
    '2', // VBR ~190 kbps, high quality
    '-ar',
    '44100',
    outPath
  ];
  await run(ffmpegBin, args, { logger });
}

/** Return the duration of an audio/video file in seconds (float). */
export async function getDuration(filePath, config, logger) {
  const { stdout } = await run(
    config.video.ffprobeBin,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      filePath
    ],
    { logger }
  );
  const seconds = parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Could not determine duration of ${filePath}`);
  }
  return seconds;
}

// "#RRGGBB" -> "0xRRGGBB" for the ffmpeg color source.
function ffColor(hex) {
  return `0x${String(hex).replace('#', '').trim().toUpperCase()}`;
}

/**
 * Render a vertical caption video. Two background modes (config.video.background):
 *
 *  - "transparent" (default): a real alpha overlay (.mov, ProRes 4444). The
 *    `ass` filter draws text into RGB but does NOT write alpha, so we use a
 *    two-pass alphamerge — colored captions for RGB + an all-white copy for the
 *    alpha mask — giving correct per-pixel transparency (outlines, soft edges).
 *
 *  - "greenscreen": captions burned onto a solid green fill (.mp4, H.264). No
 *    alpha needed, so it's a single pass; chroma-key the green in your editor.
 */
export async function renderOverlay({
  assPath,
  maskPath,
  outPath,
  durationSec,
  config,
  logger
}) {
  const { ffmpegBin } = config.video;
  assertAssFilter(ffmpegBin);
  if (config.video.background === 'greenscreen') {
    return renderGreenscreen({ assPath, outPath, durationSec, config, logger });
  }
  return renderTransparent({ assPath, maskPath, outPath, durationSec, config, logger });
}

// Copy an .ass file to an ASCII-safe temp name (the filtergraph can't reference
// spaces/special chars in the filename reliably). Returns { cwd, name, path }.
function stageAss(srcPath, outPath, suffix) {
  const safe = basename(outPath).replace(/[^A-Za-z0-9]+/g, '_') || 'overlay';
  const cwd = tmpdir();
  const name = `sg_${process.pid}_${safe}${suffix}`;
  const path = join(cwd, name);
  copyFileSync(srcPath, path);
  return { cwd, name, path };
}

async function renderTransparent({ assPath, maskPath, outPath, durationSec, config, logger }) {
  const { ffmpegBin, width, height, fps, codec, proresProfile, pixelFormat } =
    config.video;

  const source = `color=c=black:s=${width}x${height}:r=${fps}:d=${durationSec.toFixed(3)}`;
  const col = stageAss(assPath, outPath, '.ass');
  const mask = stageAss(maskPath, outPath, '.mask.ass');

  const filter =
    `[0:v]ass=${col.name}[col];` +
    `[1:v]ass=${mask.name},format=gray[m];` +
    `[col][m]alphamerge,format=${pixelFormat}[out]`;

  const args = [
    '-y', '-hide_banner', '-loglevel', 'warning',
    '-f', 'lavfi', '-i', source,
    '-f', 'lavfi', '-i', source,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', codec
  ];
  if (codec === 'prores_ks') args.push('-profile:v', proresProfile);
  args.push('-pix_fmt', pixelFormat, '-an', outPath);

  try {
    await run(ffmpegBin, args, { cwd: col.cwd, logger });
  } finally {
    rmSync(col.path, { force: true });
    rmSync(mask.path, { force: true });
  }
}

async function renderGreenscreen({ assPath, outPath, durationSec, config, logger }) {
  const { ffmpegBin, width, height, fps, greenColor, greenCrf } = config.video;

  const source =
    `color=c=${ffColor(greenColor || '#00FF00')}:s=${width}x${height}:` +
    `r=${fps}:d=${durationSec.toFixed(3)}`;
  const col = stageAss(assPath, outPath, '.ass');

  const args = [
    '-y', '-hide_banner', '-loglevel', 'warning',
    '-f', 'lavfi', '-i', source,
    '-vf', `ass=${col.name}`,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', String(greenCrf ?? 18),
    '-pix_fmt', 'yuv420p',
    '-an', outPath
  ];

  try {
    await run(ffmpegBin, args, { cwd: col.cwd, logger });
  } finally {
    rmSync(col.path, { force: true });
  }
}
