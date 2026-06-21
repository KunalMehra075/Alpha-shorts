import { createWriteStream, existsSync, statSync, readdirSync, rmSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';
import { paths } from './paths.js';

// Map a remote content-type / URL to a sane file extension.
const VIDEO_EXT_BY_TYPE = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm'
};
const IMAGE_EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

function extFromUrl(url, fallback) {
  try {
    const clean = new URL(url).pathname;
    const ext = extname(clean).toLowerCase();
    if (ext && ext.length <= 5) return ext;
  } catch {
    /* ignore */
  }
  return fallback;
}

// A short, stable cache key for a URL so the same asset is never re-downloaded.
function cacheKey(url) {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}

/**
 * Resolve an already-cached file for this URL, if present. Returns the absolute
 * path or null. Looks for any extension matching the URL's cache key.
 */
function findCached(dir, key) {
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).find((f) => f.startsWith(`${key}.`));
  if (!hit) return null;
  const full = join(dir, hit);
  // Treat zero-byte files (interrupted downloads) as a miss.
  try {
    if (statSync(full).size > 0) return full;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Download a remote asset into the cache, reusing an existing copy when present.
 *
 * @param {object} opts
 * @param {string} opts.url        Direct download URL.
 * @param {'video'|'image'} opts.kind
 * @param {object} opts.config     video-gen config (for timeout).
 * @param {object} [opts.logger]
 * @returns {Promise<{ path: string, cached: boolean }>} absolute local path.
 */
export async function downloadAsset({ url, kind, config, logger }) {
  const dir = kind === 'video' ? paths.cacheVideos : paths.cacheImages;
  const key = cacheKey(url);

  const cached = findCached(dir, key);
  if (cached) {
    logger?.debug(`cache hit (${kind}): ${url}`);
    return { path: cached, cached: true };
  }

  const timeoutMs = config?.assets?.downloadTimeoutMs ?? 60000;
  // Never download oversized assets — the final render is only 1080p.
  const maxBytes = config?.assets?.maxDownloadBytes ?? 20 * 1024 * 1024;
  const capMb = Math.round(maxBytes / (1024 * 1024));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok || !res.body) {
      throw new Error(`download failed (${res.status} ${res.statusText})`);
    }
    // Reject up-front when the server advertises a size over the cap.
    const len = Number(res.headers.get('content-length') || 0);
    if (len && len > maxBytes) {
      throw new Error(`asset too large (${(len / 1048576).toFixed(1)}MB > ${capMb}MB cap)`);
    }
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    const fallback = kind === 'video' ? '.mp4' : '.jpg';
    const table = kind === 'video' ? VIDEO_EXT_BY_TYPE : IMAGE_EXT_BY_TYPE;
    const ext = table[type] || extFromUrl(url, fallback);

    const dest = join(dir, `${key}${ext}`);
    const tmp = `${dest}.part`;
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
    // Backstop for servers that don't send Content-Length.
    if (statSync(tmp).size > maxBytes) {
      rmSync(tmp, { force: true });
      throw new Error(`asset too large (> ${capMb}MB cap)`);
    }
    // Atomic-ish: rename the completed temp file into place.
    const { renameSync } = await import('node:fs');
    renameSync(tmp, dest);
    logger?.debug(`downloaded (${kind}): ${url} -> ${dest}`);
    return { path: dest, cached: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Download the first rendition (from an ordered best→worst list) that fits the
 * size cap. Lets a long 1080p clip fall back to 720p/540p instead of failing.
 *
 * @param {object} opts
 * @param {string[]} opts.urls   Ordered candidate URLs (best quality first).
 * @param {'video'|'image'} opts.kind
 * @param {object} opts.config
 * @param {object} [opts.logger]
 * @returns {Promise<{ path: string, cached: boolean }>}
 */
export async function downloadFirstFitting({ urls, kind, config, logger }) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  if (!list.length) throw new Error('no download URL provided');
  let lastErr;
  for (const url of list) {
    try {
      return await downloadAsset({ url, kind, config, logger });
    } catch (err) {
      lastErr = err;
      logger?.debug(`rendition skipped (${err.message}): ${url}`);
    }
  }
  throw lastErr ?? new Error('no rendition could be downloaded');
}
