import { join } from 'node:path';
import { paths } from './paths.js';

/**
 * Bundle the Remotion project and render the composition to an MP4.
 * Imports the Remotion toolchain lazily so the rest of the CLI still works
 * (gen-audio / gen-caption) even before `npm install` pulls Remotion in.
 *
 * @param {object} opts
 * @param {object} opts.inputProps  Timeline produced by buildTimeline().
 * @param {object} opts.config      video-gen config (render settings).
 * @param {string} opts.outPath     Absolute path for the final .mp4.
 * @param {object} [opts.logger]
 */
export async function renderVideo({ inputProps, config, outPath, logger }) {
  let bundle, selectComposition, renderMedia;
  try {
    ({ bundle } = await import('@remotion/bundler'));
    ({ selectComposition, renderMedia } = await import('@remotion/renderer'));
  } catch {
    throw new Error(
      'Remotion is not installed. Run `npm install` (it pulls in remotion, ' +
        '@remotion/bundler and @remotion/renderer). The first render also ' +
        'downloads a headless Chromium used for rendering.'
    );
  }

  const entry = join(paths.remotion, 'index.js');
  logger?.info('Bundling Remotion project…');
  const serveUrl = await bundle({
    entryPoint: entry,
    publicDir: paths.remotionPublic,
    // Quiet, incremental webpack cache lives under node_modules/.cache.
    onProgress: (p) => logger?.debug(`bundle ${p}%`)
  });

  logger?.info('Selecting composition…');
  const composition = await selectComposition({
    serveUrl,
    id: 'ShortsVideo',
    inputProps
  });

  logger?.info(
    `Rendering ${composition.durationInFrames} frames ` +
      `(${(composition.durationInFrames / composition.fps).toFixed(1)}s) ` +
      `at ${composition.width}x${composition.height}…`
  );

  let lastLogged = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: config.render.codec || 'h264',
    crf: config.render.crf ?? 18,
    imageFormat: config.render.imageFormat || 'jpeg',
    outputLocation: outPath,
    inputProps,
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct >= lastLogged + 10) {
        lastLogged = pct;
        logger?.info(`Rendering… ${pct}%`);
      }
    }
  });

  return outPath;
}
