import { readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDirs, paths } from './lib/paths.js';
import { createLogger } from './lib/logger.js';
import { parseCliArgs, normalizeName } from './lib/cli.js';

// Folders this command is allowed to clean.
const TARGETS = [
  { label: 'caption-overlays', dir: paths.overlays },
  { label: 'generated-subtitles', dir: paths.subtitles }
];

// Decide which files in a folder to remove. With a name, only that item's
// artifacts (<name>.json/.ass/.mask.ass and <name>-overlay.mov/.mp4); the
// .gitkeep placeholder is always preserved.
function filesToRemove(dir, name) {
  if (!existsSync(dir)) return [];
  const all = readdirSync(dir).filter((f) => f !== '.gitkeep');
  if (!name) return all;
  return all.filter(
    (f) =>
      f.startsWith(`${name}.`) || // subtitles: name.json / name.ass / name.mask.ass
      f === `${name}-overlay.mov` ||
      f === `${name}-overlay.mp4`
  );
}

function main() {
  ensureDirs();
  const { name: rawName } = parseCliArgs();
  const name = rawName ? normalizeName(rawName) : undefined;
  const log = createLogger('cleanup');

  log.info(
    name
      ? `Cleaning artifacts for "${name}" from caption-overlays + generated-subtitles.`
      : 'Cleaning caption-overlays + generated-subtitles.'
  );

  let total = 0;
  for (const { label, dir } of TARGETS) {
    const files = filesToRemove(dir, name);
    for (const file of files) {
      rmSync(join(dir, file), { force: true });
      log.info(`🗑  Removed ${label}/${file}`);
    }
    log.info(`${label}: removed ${files.length} file(s).`);
    total += files.length;
  }

  log.info(`Done. removed ${total} file(s) total.`);
}

main();
