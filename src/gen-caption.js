import { existsSync, writeFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { ensureDirs, paths } from './lib/paths.js';
import { loadConfig, resolveStyle } from './lib/config.js';
import { createLogger } from './lib/logger.js';
import { transcribe } from './lib/whisper.js';
import { buildAss, maskStyle } from './lib/ass-generator.js';
import { getDuration, renderOverlay } from './lib/ffmpeg.js';
import { parseCliArgs, resolveTargets, CliError } from './lib/cli.js';

const { name, force: FORCE, language, background } = parseCliArgs();

async function main() {
  ensureDirs();
  const config = loadConfig({ language, background });
  const style = resolveStyle(config);
  const log = createLogger('gen-caption');

  const greenscreen = config.video.background === 'greenscreen';
  const outExt = greenscreen ? '.mp4' : '.mov';

  log.info('Starting caption overlay generation (Whisper + FFmpeg).');
  log.info(
    `Language: ${config.language} (whisper model=${config.whisper.model}, ` +
      `language=${config.whisper.language || 'auto'}).`
  );
  log.info(`Caption style: "${style.name}".`);
  log.info(
    `Background: ${config.video.background} (output ${outExt})` +
      `; animation: enter=${style.animation.enter}, exit=${style.animation.exit}.`
  );
  if (FORCE) log.info('--force enabled: re-rendering existing overlays.');

  const { files, single } = resolveTargets({
    dir: paths.audio,
    ext: '.mp3',
    name,
    label: 'audio files (generated-audio/*.mp3)',
    emptyHint: `No .mp3 files found in ${paths.audio}. Run "npm run gen-audio" first.`
  });

  if (files.length === 0) {
    log.warn(
      `No .mp3 files found in ${paths.audio}. Run "npm run gen-audio" first.`
    );
    await log.close();
    return;
  }

  log.info(
    single
      ? `Processing single audio file: "${basename(files[0], '.mp3')}".`
      : `Found ${files.length} audio file(s).`
  );

  let rendered = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const name = basename(file, extname(file));
    const audioPath = join(paths.audio, file);
    const assPath = join(paths.subtitles, `${name}.ass`);
    const maskPath = join(paths.subtitles, `${name}.mask.ass`);
    const outPath = join(paths.overlays, `${name}-overlay${outExt}`);

    if (!FORCE && existsSync(outPath)) {
      log.info(`↷ Skip "${name}" — overlay already exists (use --force).`);
      skipped++;
      continue;
    }

    try {
      // 1. Word-level transcription (cached as <name>.json).
      const { words } = await transcribe({
        audioPath,
        config,
        logger: log,
        force: FORCE
      });
      log.ok(`✓ Transcribed "${name}" (${words.length} words).`);

      // 2. Build karaoke ASS subtitles (color pass + white alpha-mask pass).
      writeFileSync(assPath, buildAss(words, style, config.video), 'utf8');
      writeFileSync(
        maskPath,
        buildAss(words, maskStyle(style), config.video),
        'utf8'
      );
      log.ok(`✓ Wrote subtitles ${name}.ass (+ mask).`);

      // 3. Render transparent overlay matched to audio length.
      const durationSec = await getDuration(audioPath, config, log);
      log.info(
        `▶ Rendering overlay "${name}" (${durationSec.toFixed(1)}s, ${
          config.video.width
        }x${config.video.height}, ${config.video.codec})...`
      );
      await renderOverlay({
        assPath,
        maskPath,
        outPath,
        durationSec,
        config,
        logger: log
      });
      log.ok(`✓ Wrote ${name}-overlay${outExt}.`);
      rendered++;
    } catch (err) {
      log.error(`✗ Failed "${name}": ${err.message}`);
      failed++;
    }
  }

  log.info(`Done. rendered=${rendered} skipped=${skipped} failed=${failed}.`);
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
