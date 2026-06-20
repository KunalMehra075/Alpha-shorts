import { readFileSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { ensureDirs, paths } from './lib/paths.js';
import { loadConfig } from './lib/config.js';
import { createLogger } from './lib/logger.js';
import { generateAudio } from './lib/elevenlabs.js';
import { parseCliArgs, resolveTargets, CliError } from './lib/cli.js';

async function main() {
  ensureDirs();
  const { name, language } = parseCliArgs();
  const config = loadConfig({ language });
  const log = createLogger('gen-audio');

  log.info('Starting audio generation (ElevenLabs).');
  log.info(`Language: ${config.language}.`);

  const { files, single } = resolveTargets({
    dir: paths.scripts,
    ext: '.txt',
    name,
    label: 'scripts (videoscripts/*.txt)',
    emptyHint: `No .txt scripts found in ${paths.scripts}. Add some and re-run.`
  });

  if (files.length === 0) {
    log.warn(`No .txt scripts found in ${paths.scripts}. Add some and re-run.`);
    await log.close();
    return;
  }

  log.info(
    single
      ? `Processing single script: "${basename(files[0], '.txt')}".`
      : `Found ${files.length} script(s).`
  );

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const name = basename(file, extname(file));
    const inPath = join(paths.scripts, file);
    const outPath = join(paths.audio, `${name}.mp3`);

    if (existsSync(outPath)) {
      log.info(`↷ Skip "${name}" — audio already exists.`);
      skipped++;
      continue;
    }

    const text = readFileSync(inPath, 'utf8').trim();
    if (!text) {
      log.warn(`↷ Skip "${name}" — script file is empty.`);
      skipped++;
      continue;
    }

    try {
      log.info(`♪ Generating "${name}" (${text.length} chars)...`);
      const { bytes } = await generateAudio({
        text,
        outPath,
        config,
        logger: log
      });
      log.ok(`✓ Wrote ${name}.mp3 (${(bytes / 1024).toFixed(1)} KB).`);
      generated++;
    } catch (err) {
      log.error(`✗ Failed "${name}": ${err.message}`);
      failed++;
    }
  }

  log.info(
    `Done. generated=${generated} skipped=${skipped} failed=${failed}.`
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
