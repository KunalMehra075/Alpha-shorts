import { existsSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDirs, paths, ROOT } from './lib/paths.js';

ensureDirs();

// Keep otherwise-empty input/output folders tracked in git.
for (const dir of [
  paths.rawVideos,
  paths.audio,
  paths.subtitles,
  paths.overlays,
  paths.logs,
  paths.scenes,
  paths.cacheVideos,
  paths.cacheImages,
  paths.library,
  paths.music,
  paths.output
]) {
  const keep = join(dir, '.gitkeep');
  if (!existsSync(keep)) writeFileSync(keep, '');
}

// Create .env from the example on first run.
const env = join(ROOT, '.env');
const example = join(ROOT, '.env.example');
if (!existsSync(env) && existsSync(example)) {
  copyFileSync(example, env);
  console.log('Created .env from .env.example — fill in your ElevenLabs keys.');
} else if (existsSync(env)) {
  console.log('.env already exists — leaving it untouched.');
}

// Drop a sample script if none exist yet.
const sample = join(paths.scripts, 'example.txt');
if (!existsSync(sample)) {
  writeFileSync(
    sample,
    'This is an example script. Replace this text with your own narration, ' +
      'or delete this file. Each .txt file in this folder becomes one audio clip.\n'
  );
  console.log('Added a sample script at videoscripts/example.txt');
}

console.log('\nSetup complete. Folder structure is ready.');
console.log('Next:');
console.log('  1. Edit .env with your ElevenLabs API key + Voice ID');
console.log('  2. Add your scripts to videoscripts/*.txt');
console.log('  3. npm run gen-audio');
console.log('  4. npm run gen-caption');
console.log('\nTip: run "npm run doctor" to verify ffmpeg/whisper are installed.');
