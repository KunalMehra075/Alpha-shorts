import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/paths.js';
import { loadConfig } from './lib/config.js';
import { hasAssFilter } from './lib/ffmpeg.js';

function check(label, fn) {
  try {
    const detail = fn();
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${label} — ${err.message}`);
    return false;
  }
}

function version(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  if (res.error) throw new Error(`not found on PATH`);
  if (res.status !== 0) throw new Error(`exited ${res.status}`);
  return (res.stdout || res.stderr).split('\n')[0].trim();
}

console.log('\nshorts-generator doctor\n');

const config = loadConfig();

console.log('Runtime:');
check('Node.js >= 22', () => {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) throw new Error(`found ${process.versions.node} (22+ recommended)`);
  return `v${process.versions.node}`;
});

console.log('\nExternal tools:');
check(`ffmpeg (${config.video.ffmpegBin})`, () =>
  version(config.video.ffmpegBin, ['-version'])
);
check(`ffprobe (${config.video.ffprobeBin})`, () =>
  version(config.video.ffprobeBin, ['-version'])
);
check('ffmpeg libass support (ass filter)', () => {
  if (!hasAssFilter(config.video.ffmpegBin))
    throw new Error(
      'missing — captions need libass. macOS: brew install ffmpeg-full, then set FFMPEG_BIN/FFPROBE_BIN'
    );
  return 'available';
});
check(`whisper (bin: ${config.whisper.bin})`, () =>
  version(config.whisper.bin, ['--help']) ? 'installed' : 'installed'
);

console.log('\nConfiguration:');
check('.env present', () => {
  if (!existsSync(join(ROOT, '.env'))) throw new Error('missing — run "npm run setup"');
  return 'found';
});
check('ELEVENLABS_API_KEY set', () => {
  if (!config.elevenlabs.apiKey) throw new Error('empty');
  return 'set';
});
check('ELEVENLABS_VOICE_ID set', () => {
  if (!config.elevenlabs.voiceId) throw new Error('empty');
  return config.elevenlabs.voiceId;
});
check('ELEVENLABS_MODEL_ID set', () => {
  if (!config.elevenlabs.modelId) throw new Error('empty');
  return config.elevenlabs.modelId;
});
check('Language / caption preset', () => {
  return `language=${config.language}, whisper=${
    config.whisper.language || 'auto'
  }, preset=${config.captions.activeStyle}`;
});

console.log('\nDone.\n');
