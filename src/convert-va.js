import { readdirSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { ensureDirs, paths } from './lib/paths.js';
import { loadConfig } from './lib/config.js';
import { createLogger } from './lib/logger.js';
import { extractAudio } from './lib/ffmpeg.js';
import { parseCliArgs, CliError } from './lib/cli.js';

// Recognized raw video container extensions.
const VIDEO_EXT = new Set([
  '.mp4', '.mov', '.mkv', '.webm', '.avi',
  '.m4v', '.flv', '.wmv', '.mpg', '.mpeg', '.ts'
]);

// Strip a known video extension if the user included one ("clip.mp4" -> "clip").
function stripVideoExt(arg) {
  const base = basename(arg.trim());
  const ext = extname(base).toLowerCase();
  return VIDEO_EXT.has(ext) ? base.slice(0, -ext.length) : base;
}

function listVideos() {
  if (!existsSync(paths.rawVideos)) return [];
  return readdirSync(paths.rawVideos)
    .filter((f) => VIDEO_EXT.has(extname(f).toLowerCase()))
    .sort();
}

/**
 * Resolve which raw videos to convert.
 *  - name given  -> just the matching file (any video extension).
 *  - no name     -> every video in raw-videos/.
 */
function resolveVideos(name) {
  const all = listVideos();
  if (!name) return all;

  const base = stripVideoExt(name);
  const matches = all.filter((f) => basename(f, extname(f)) === base);
  if (matches.length === 0) {
    const available = all.map((f) => basename(f, extname(f)));
    const hint = available.length
      ? `Available videos:\n  ${available.join('\n  ')}`
      : `No videos found in ${paths.rawVideos}. Add some and re-run.`;
    throw new CliError(
      `Could not find a video named "${base}" in ${paths.rawVideos}.\n${hint}`
    );
  }
  return matches;
}

async function main() {
  ensureDirs();
  const { name, force } = parseCliArgs();
  const config = loadConfig();
  const log = createLogger('convert-va');

  log.info('Starting video → audio conversion (FFmpeg).');

  const videos = resolveVideos(name);
  if (videos.length === 0) {
    log.warn(
      `No videos found in ${paths.rawVideos}. Drop some video files there and re-run.`
    );
    await log.close();
    return;
  }

  log.info(
    name
      ? `Converting single video: "${stripVideoExt(name)}".`
      : `Found ${videos.length} video(s).`
  );

  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of videos) {
    const base = basename(file, extname(file));
    const videoPath = join(paths.rawVideos, file);
    const outPath = join(paths.audio, `${base}.mp3`);

    if (!force && existsSync(outPath)) {
      log.info(`↷ Skip "${base}" — audio already exists (use --force).`);
      skipped++;
      continue;
    }

    try {
      log.info(`♪ Extracting audio from "${file}"...`);
      await extractAudio({ videoPath, outPath, config, logger: log });
      log.ok(`✓ Wrote ${base}.mp3 → generated-audio/.`);
      converted++;
    } catch (err) {
      log.error(`✗ Failed "${file}": ${err.message}`);
      failed++;
    }
  }

  log.info(
    `Done. converted=${converted} skipped=${skipped} failed=${failed}.`
  );
  await log.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  if (err instanceof CliError) {
    console.error(`\n${err.message}\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
