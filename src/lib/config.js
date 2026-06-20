import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
import { paths } from './paths.js';

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

// Deep-ish merge: arrays and scalars from `override` win; objects merge recursively.
function merge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === 'object'
    ) {
      out[key] = merge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Load the merged runtime configuration.
 * Precedence (lowest -> highest):
 *   config/default.json  <  environment variables  <  CLI options (opts).
 *
 * @param {object} [opts]
 * @param {string} [opts.language]   Language from a CLI flag (-hi/-en). Highest priority.
 * @param {string} [opts.background] Background from a CLI flag (--green/--transparent).
 */
export function loadConfig(opts = {}) {
  const defaults = readJson(join(paths.config, 'default.json'));
  console.log('Loaded default config from', join(paths.config, 'default.json'));
  console.log('Options:', opts);

  const envOverrides = {
    ...(process.env.LANGUAGE ? { language: process.env.LANGUAGE } : {}),
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY,
      // Voice + model are managed in config (voiceId/modelId default in
      // default.json; the dashboard passes a voice per request). They only
      // override here if explicitly set in the environment.
      ...(process.env.ELEVENLABS_VOICE_ID
        ? { voiceId: process.env.ELEVENLABS_VOICE_ID }
        : {}),
      ...(process.env.ELEVENLABS_MODEL_ID
        ? { modelId: process.env.ELEVENLABS_MODEL_ID }
        : {}),
      ...(process.env.ELEVENLABS_OUTPUT_FORMAT
        ? { outputFormat: process.env.ELEVENLABS_OUTPUT_FORMAT }
        : {})
    },
    whisper: {
      ...(process.env.WHISPER_BIN ? { bin: process.env.WHISPER_BIN } : {}),
      ...(process.env.WHISPER_MODEL ? { model: process.env.WHISPER_MODEL } : {}),
      ...(process.env.WHISPER_LANGUAGE !== undefined
        ? { language: process.env.WHISPER_LANGUAGE }
        : {})
    },
    video: {
      ...(process.env.FFMPEG_BIN ? { ffmpegBin: process.env.FFMPEG_BIN } : {}),
      ...(process.env.FFPROBE_BIN ? { ffprobeBin: process.env.FFPROBE_BIN } : {}),
      ...(process.env.VIDEO_BACKGROUND
        ? { background: process.env.VIDEO_BACKGROUND }
        : {})
    },
    captions: {
      ...(process.env.CAPTION_STYLE
        ? { activeStyle: process.env.CAPTION_STYLE }
        : {})
    }
  };

  const config = merge(defaults, envOverrides);
  resolveLanguage(config, opts);

  // Background mode: CLI flag > env > default.json > "transparent".
  config.video.background =
    opts.background || config.video.background || 'transparent';

  return config;
}

/**
 * Resolve language-dependent settings in place:
 *  - Language precedence: CLI flag (opts.language, -hi/-en) > LANGUAGE env >
 *    config/default.json > "en".
 *  - Whisper transcription language follows the resolved language unless an
 *    explicit `whisper.language`/`WHISPER_LANGUAGE` was provided. "auto" (or
 *    empty) means Whisper auto-detects.
 *  - Whisper model: explicit `whisper.model`/`WHISPER_MODEL` wins; otherwise the
 *    model mapped to the language in `whisper.modelByLanguage` (en→base, hi→small).
 *  - Caption preset: `captions.activeStyle` if set, otherwise the preset mapped
 *    to the language in `captions.byLanguage`.
 */
function resolveLanguage(config, opts = {}) {
  const language = opts.language || config.language || 'en';
  config.language = language;

  // Whisper language: explicit override wins; otherwise follow the language;
  // "auto" or empty => auto-detect (handled in lib/whisper.js).
  if (!config.whisper.language) {
    config.whisper.language = language === 'auto' ? '' : language;
  } else if (config.whisper.language === 'auto') {
    config.whisper.language = '';
  }

  // Whisper model: explicit override wins; otherwise pick by language.
  if (!config.whisper.model) {
    const byLang = config.whisper.modelByLanguage || {};
    config.whisper.model = byLang[language] || byLang.en || 'base';
  }

  // Caption preset: explicit override wins; otherwise pick by language.
  if (!config.captions.activeStyle) {
    const byLang = config.captions.byLanguage || {};
    config.captions.activeStyle = byLang[language] || byLang.en || 'hormozi';
  }
}

/** Load all caption style presets. */
export function loadStyles() {
  const styles = readJson(join(paths.config, 'caption-styles.json'));
  delete styles._comment;
  return styles;
}

/**
 * Resolve the active caption style preset, throwing a helpful error if missing.
 * The returned style includes a merged `animation` object:
 *   default.json (captions.animation) < preset's own `animation` override.
 */
export function resolveStyle(config) {
  const styles = loadStyles();
  const name = config.captions.activeStyle;
  const style = styles[name];
  if (!style) {
    const available = Object.keys(styles).join(', ');
    throw new Error(
      `Caption style "${name}" not found in config/caption-styles.json. Available: ${available}`
    );
  }
  const animation = {
    enter: 'pop',
    exit: 'pop',
    enterDuration: 120,
    exitDuration: 90,
    ...(config.captions.animation || {}),
    ...(style.animation || {})
  };
  return { name, ...style, animation };
}
