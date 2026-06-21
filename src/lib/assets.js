import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { paths } from './paths.js';

const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function orientationOf(width, height) {
  if (!width || !height) return 'unknown';
  if (height > width * 1.05) return 'portrait';
  if (width > height * 1.05) return 'landscape';
  return 'square';
}

// The final render is 1080×1920, so anything beyond 1080p is wasted bytes. A
// variant is "within cap" when its short side ≤ 1080 and long side ≤ 1920.
function withinResCap(width, height) {
  if (!width || !height) return false;
  return Math.min(width, height) <= 1080 && Math.max(width, height) <= 1920;
}

const fileArea = (f) => (f.width || 0) * (f.height || 0);

// Order variants best-first for downloading: largest within the 1080p cap first
// (so we get true 1080p), then progressively smaller. The downloader walks this
// list and keeps the first that fits the size cap (see asset-cache.js), so a long
// 1080p clip gracefully falls back to 720p/540p instead of failing.
function cappedList(variants) {
  const pool = variants.filter(Boolean);
  if (!pool.length) return [];
  const byAreaDesc = [...pool].sort((a, b) => fileArea(b) - fileArea(a));
  const within = byAreaDesc.filter((v) => withinResCap(v.width, v.height));
  // Within-cap from largest→smallest; if none qualify, just the smallest overall.
  return within.length ? within : [byAreaDesc[byAreaDesc.length - 1]];
}

// Normalize a popularity count (downloads/likes) into a 0..1-ish range.
function popularityScore(count) {
  if (!count || count <= 0) return 0;
  return Math.min(1, Math.log10(count + 1) / 6); // ~1.0 around 1M
}

// Resolution score: 0..1, saturating around 4K worth of pixels.
function resolutionScore(width, height) {
  if (!width || !height) return 0.3;
  const px = width * height;
  return Math.min(1, px / (3840 * 2160));
}

/**
 * Score a normalized candidate. Higher is better. Weighted by:
 *  - asset type (video > image), orientation (portrait > landscape > square),
 *    resolution, popularity, search relevance (rank), and a big local-library bonus.
 */
function scoreCandidate(c, scoring) {
  let s = 0;
  if (c.type === 'video') s += scoring.videoBonus;

  if (c.orientation === 'portrait') s += scoring.portraitBonus;
  else if (c.orientation === 'landscape') s += scoring.landscapeBonus;
  else if (c.orientation === 'square') s += scoring.squareBonus;

  s += resolutionScore(c.width, c.height) * scoring.resolutionWeight;
  s += popularityScore(c.popularity) * scoring.popularityWeight;
  s += (c.relevance ?? 0) * scoring.relevanceWeight;
  if (c.source === 'library') s += scoring.libraryBonus;

  return s;
}

// ── Local library ──────────────────────────────────────────────────────────

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function tokenize(s) {
  return String(s)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Search the local assets/library/ tree for files matching the keywords. */
function searchLibrary(keywords) {
  const files = walk(paths.library);
  if (files.length === 0) return [];

  const wanted = new Set(keywords.flatMap(tokenize));
  const candidates = [];

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const isVideo = VIDEO_EXT.has(ext);
    const isImage = IMAGE_EXT.has(ext);
    if (!isVideo && !isImage) continue;

    // Match keyword tokens against the relative path (folder names + filename).
    const rel = file.slice(paths.library.length + 1).toLowerCase();
    const haystack = new Set(tokenize(rel));
    let hits = 0;
    for (const w of wanted) if (haystack.has(w)) hits++;
    if (hits === 0) continue;

    candidates.push({
      type: isVideo ? 'video' : 'image',
      source: 'library',
      libraryPath: file,
      downloadUrl: null,
      thumb: '', // local file; the dashboard previews via /media after copy
      width: 0,
      height: 0,
      orientation: 'unknown',
      popularity: 0,
      relevance: hits / Math.max(1, wanted.size),
      label: basename(file)
    });
  }
  return candidates;
}

// ── Pexels ───────────────────────────────────────────────────────────────

// Ordered Pexels mp4 renditions (best→worst) capped at 1080p, for the downloader
// to walk until one fits the size cap.
function pexelsRenditions(files) {
  const linked = (files || []).filter((f) => f.link);
  const mp4 = linked.filter((f) => (f.file_type || '').includes('mp4'));
  return cappedList(mp4.length ? mp4 : linked);
}

async function searchPexels({ apiKey, query, perPage, logger, orientation }) {
  const headers = { Authorization: apiKey };
  const out = [];

  // Videos
  try {
    const url =
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}` +
      `&per_page=${perPage}&orientation=${orientation}`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      (data.videos || []).forEach((v, i) => {
        const ordered = pexelsRenditions(v.video_files || []);
        if (!ordered.length) return;
        const file = ordered[0];
        out.push({
          type: 'video',
          source: 'pexels',
          downloadUrl: file.link,
          downloadUrls: ordered.map((f) => f.link), // 1080p first, then fallbacks
          thumb: v.image || '', // poster frame for previews
          width: file.width || v.width,
          height: file.height || v.height,
          orientation: orientationOf(file.width || v.width, file.height || v.height),
          popularity: 0,
          relevance: 1 - i / perPage,
          label: v.url
        });
      });
    } else {
      logger?.debug(`pexels videos: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    logger?.debug(`pexels videos error: ${err.message}`);
  }

  // Photos
  try {
    const url =
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
      `&per_page=${perPage}&orientation=${orientation}`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      (data.photos || []).forEach((p, i) => {
        const src = p.src?.large2x || p.src?.original || p.src?.large;
        if (!src) return;
        out.push({
          type: 'image',
          source: 'pexels',
          downloadUrl: src,
          thumb: p.src?.medium || p.src?.small || src, // smaller preview
          width: p.width,
          height: p.height,
          orientation: orientationOf(p.width, p.height),
          popularity: 0,
          relevance: 1 - i / perPage,
          label: p.url
        });
      });
    } else {
      logger?.debug(`pexels photos: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    logger?.debug(`pexels photos error: ${err.message}`);
  }

  return out;
}

// ── Pixabay ────────────────────────────────────────────────────────────────

function pixabayRenditions(videos) {
  // videos = { large, medium, small, tiny } each { url, width, height, thumbnail }
  const variants = Object.values(videos || {}).filter((v) => v && v.url);
  return cappedList(variants); // 1080p first, then fallbacks
}

async function searchPixabay({ apiKey, query, perPage, logger }) {
  const out = [];
  const q = encodeURIComponent(query);

  // Videos
  try {
    const url =
      `https://pixabay.com/api/videos/?key=${apiKey}&q=${q}&per_page=${perPage}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      (data.hits || []).forEach((h, i) => {
        const ordered = pixabayRenditions(h.videos);
        if (!ordered.length) return;
        const file = ordered[0];
        out.push({
          type: 'video',
          source: 'pixabay',
          downloadUrl: file.url,
          downloadUrls: ordered.map((v) => v.url), // 1080p first, then fallbacks
          thumb: file.thumbnail || '', // poster frame for previews
          width: file.width,
          height: file.height,
          orientation: orientationOf(file.width, file.height),
          popularity: (h.downloads || 0) + (h.likes || 0) * 10,
          relevance: 1 - i / perPage,
          label: h.pageURL
        });
      });
    } else {
      logger?.debug(`pixabay videos: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    logger?.debug(`pixabay videos error: ${err.message}`);
  }

  // Images
  try {
    const url =
      `https://pixabay.com/api/?key=${apiKey}&q=${q}&per_page=${perPage}&image_type=photo`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      (data.hits || []).forEach((h, i) => {
        const src = h.largeImageURL || h.webformatURL;
        if (!src) return;
        out.push({
          type: 'image',
          source: 'pixabay',
          downloadUrl: src,
          thumb: h.webformatURL || h.previewURL || src, // smaller preview
          width: h.imageWidth,
          height: h.imageHeight,
          orientation: orientationOf(h.imageWidth, h.imageHeight),
          popularity: (h.downloads || 0) + (h.likes || 0) * 10,
          relevance: 1 - i / perPage,
          label: h.pageURL
        });
      });
    } else {
      logger?.debug(`pixabay images: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    logger?.debug(`pixabay images error: ${err.message}`);
  }

  return out;
}

/**
 * Gather and rank asset candidates for a scene's keywords across all configured
 * providers, honoring the search order: local library, then Pexels, then Pixabay.
 *
 * @returns {Promise<Array>} candidates sorted best-first (may be empty).
 */
export async function searchAssets({ keywords, config, logger }) {
  const list = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
  if (list.length === 0) return [];

  const query = list.join(' ');
  const perPage = config.assets.perKeywordResults;
  const order = config.assets.providers || ['library', 'pexels', 'pixabay'];

  let candidates = [];
  for (const provider of order) {
    if (provider === 'library') {
      candidates.push(...searchLibrary(list));
    } else if (provider === 'pexels' && config.providers.pexels.enabled) {
      candidates.push(
        ...(await searchPexels({
          apiKey: config.providers.pexels.apiKey,
          query,
          perPage,
          orientation: 'portrait',
          logger
        }))
      );
    } else if (provider === 'pixabay' && config.providers.pixabay.enabled) {
      candidates.push(
        ...(await searchPixabay({
          apiKey: config.providers.pixabay.apiKey,
          query,
          perPage,
          logger
        }))
      );
    }
  }

  const scoring = config.assets.scoring;
  candidates.forEach((c) => {
    c.score = scoreCandidate(c, scoring);
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/** Convenience: best single candidate for the keywords, or null. */
export async function searchAsset({ keywords, config, logger }) {
  const all = await searchAssets({ keywords, config, logger });
  return all[0] || null;
}
