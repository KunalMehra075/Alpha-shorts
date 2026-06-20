import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDirs, paths } from './lib/paths.js';
import { createLogger } from './lib/logger.js';
import { parseCliArgs, CliError } from './lib/cli.js';
import { loadVideoConfig } from './lib/video-config.js';
import { readScript, buildTimeline } from './lib/timeline.js';
import { renderVideo } from './lib/remotion-render.js';

const NARRATION_EXT = ['.mp3', '.wav', '.m4a'];

// Find a narration track in generated-audio/ whose base name matches the script.
function resolveNarration(name, logger) {
  for (const ext of NARRATION_EXT) {
    const p = join(paths.audio, `${name}${ext}`);
    if (existsSync(p)) return p;
  }
  logger?.warn(
    `No narration found for "${name}" in generated-audio/ ` +
      `(looked for ${NARRATION_EXT.join(', ')}). Rendering without narration. ` +
      `Tip: run "npm run gen-audio ${name}" first.`
  );
  return null;
}

// Resolve the optional background-music file from music/.
function resolveMusic(config, logger) {
  if (!config.music.enabled || !config.music.track) return null;
  const p = join(paths.music, config.music.track);
  if (existsSync(p)) return p;
  logger?.warn(`Background music "${config.music.track}" not found in ${paths.music}.`);
  return null;
}

async function main() {
  ensureDirs();
  const { positionals } = parseCliArgs();
  const scriptArg = positionals[0];
  const log = createLogger('generate-video');

  if (!scriptArg) {
    throw new CliError(
      'Usage: npm run generate-video <script.json>\n' +
        `Pass a path to a scene script, or drop one in ${paths.scenes}.`
    );
  }

  const config = loadVideoConfig();
  const script = readScript(scriptArg);
  log.info(`Loaded "${script.name}" — ${script.scenes.length} scene(s).`);

  if (!config.providers.pexels.enabled && !config.providers.pixabay.enabled) {
    log.warn(
      'No stock provider keys set (PEXELS_API_KEY / PIXABAY_API_KEY). ' +
        'Using only local assets/library/ + procedural animation scenes.'
    );
  }

  const narrationPath = resolveNarration(script.name, log);
  const musicPath = resolveMusic(config, log);

  log.info('Resolving assets and building timeline…');
  const inputProps = await buildTimeline({
    script,
    config,
    narrationPath,
    musicPath,
    logger: log
  });

  const usedAnimation = inputProps.scenes.filter((s) => s.visualType === 'animation').length;
  log.info(
    `Timeline ready: ${inputProps.scenes.length} scene(s), ` +
      `${usedAnimation} animation fallback(s), ` +
      `${(inputProps.durationInFrames / inputProps.fps).toFixed(1)}s total.`
  );

  const outPath = join(paths.output, `${script.name}.mp4`);
  await renderVideo({ inputProps, config, outPath, logger: log });

  log.ok(`✓ Rendered ${script.name}.mp4 → output/`);
  log.info(`Final video: ${outPath}`);
  await log.close();
}

main().catch((err) => {
  if (err instanceof CliError) {
    console.error(`\n${err.message}\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
