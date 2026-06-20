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

// Choose the best downloadable file from a Pexels video entry: an mp4 with the
// largest resolution that still fits comfortably for a 1080p vertical render.
function pickPexelsVideoFile(files) {
  const mp4 = files.filter((f) => (f.file_type || '').includes('mp4'));
  const pool = mp4.length ? mp4 : files;
  const sized = pool
    .filter((f) => f.link)
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
  // Prefer the largest at/under ~4K width, else just the largest available.
  return sized.find((f) => (f.width || 0) <= 4096) || sized[0] || null;
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
        const file = pickPexelsVideoFile(v.video_files || []);
        if (!file) return;
        out.push({
          type: 'video',
          source: 'pexels',
          downloadUrl: file.link,
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

function pickPixabayVideoFile(videos) {
  // videos = { large, medium, small, tiny } each { url, width, height }
  const variants = Object.values(videos || {}).filter((v) => v && v.url);
  variants.sort(
    (a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0)
  );
  return variants[0] || null;
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
        const file = pickPixabayVideoFile(h.videos);
        if (!file) return;
        out.push({
          type: 'video',
          source: 'pixabay',
          downloadUrl: file.url,
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
