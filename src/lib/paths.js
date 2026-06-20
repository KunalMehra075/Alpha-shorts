import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

// Project root is two levels up from src/lib/
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const ROOT = join(__dirname, '..', '..');

export const paths = {
  root: ROOT,
  rawVideos: join(ROOT, 'raw-videos'),
  scripts: join(ROOT, 'videoscripts'),
  audio: join(ROOT, 'generated-audio'),
  subtitles: join(ROOT, 'generated-subtitles'),
  overlays: join(ROOT, 'caption-overlays'),
  logs: join(ROOT, 'logs'),
  config: join(ROOT, 'config'),

  // Automated video generation (Remotion) module
  scenes: join(ROOT, 'scene-scripts'), // input *.json scene scripts
  cache: join(ROOT, 'cache'), // downloaded stock assets (reused across runs)
  cacheVideos: join(ROOT, 'cache', 'videos'),
  cacheImages: join(ROOT, 'cache', 'images'),
  library: join(ROOT, 'assets', 'library'), // hand-curated local assets
  music: join(ROOT, 'music'), // optional background tracks
  output: join(ROOT, 'output'), // final rendered MP4s
  remotion: join(ROOT, 'remotion'), // Remotion entry + compositions
  remotionPublic: join(ROOT, 'remotion', 'public') // staged assets served to Remotion
};

// Folders that must exist before any pipeline runs.
const REQUIRED_DIRS = [
  paths.rawVideos,
  paths.scripts,
  paths.audio,
  paths.subtitles,
  paths.overlays,
  paths.logs,
  paths.config,
  paths.scenes,
  paths.cacheVideos,
  paths.cacheImages,
  paths.library,
  paths.music,
  paths.output
];

export function ensureDirs() {
  for (const dir of REQUIRED_DIRS) {
    mkdirSync(dir, { recursive: true });
  }
}
