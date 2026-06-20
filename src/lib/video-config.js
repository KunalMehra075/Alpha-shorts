import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
import { paths } from './paths.js';

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * Load the merged configuration for the automated video-generation module.
 * Precedence (lowest -> highest): config/video-gen.json < environment variables.
 *
 * Environment variables:
 *   PEXELS_API_KEY        Pexels stock API key (https://www.pexels.com/api/)
 *   PIXABAY_API_KEY       Pixabay stock API key (https://pixabay.com/api/docs/)
 *   VIDEO_GEN_MUSIC       Background music filename in music/ (enables music)
 *   VIDEO_GEN_MUSIC_VOLUME  0.0 - 1.0 background music volume
 */
export function loadVideoConfig() {
  const cfg = readJson(join(paths.config, 'video-gen.json'));

  cfg.providers = {
    pexels: {
      apiKey: process.env.PEXELS_API_KEY || '',
      enabled: !!process.env.PEXELS_API_KEY
    },
    pixabay: {
      apiKey: process.env.PIXABAY_API_KEY || '',
      enabled: !!process.env.PIXABAY_API_KEY
    }
  };

  if (process.env.VIDEO_GEN_MUSIC) {
    cfg.music.enabled = true;
    cfg.music.track = process.env.VIDEO_GEN_MUSIC;
  }
  if (process.env.VIDEO_GEN_MUSIC_VOLUME) {
    const v = Number(process.env.VIDEO_GEN_MUSIC_VOLUME);
    if (Number.isFinite(v)) cfg.music.volume = v;
  }

  return cfg;
}
