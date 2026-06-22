import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { google } from 'googleapis';
import { ensureDir, readJsonOr, removePath, writeJson } from './fsx';
import { ROOT } from './paths';
import { HttpError, getUpload, readManifest } from './store';
import { googleAuth, youtubeConfigured } from './youtube';
import { hasOAuthClient, oauthRedirectUri } from './googleOAuth';

// ── Types ─────────────────────────────────────────────────────────────────────
export type Range = '7d' | '30d' | '90d' | '365d' | 'lifetime';
export const RANGES: Range[] = ['7d', '30d', '90d', '365d', 'lifetime'];

type Totals = {
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  comments: number;
  shares: number;
};

export type SeriesPoint = {
  date: string;
  views: number;
  subscribers: number; // net for the day (gained - lost)
  likes: number;
  comments: number;
  watchTime: number; // minutes
  engagement: number; // (likes+comments+shares)/views * 100
};

export type VideoRow = {
  videoId: string;
  title: string;
  thumbnail: string | null;
  publishedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTime: number; // minutes
  avgViewDuration: number; // seconds
  retention: number; // averageViewPercentage
  subscribersGained: number;
  engagementRate: number; // %
};

type Channel = {
  id: string;
  title: string;
  thumbnail: string | null;
  publishedAt: string | null;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
};

type Bundle = {
  fetchedAt: string;
  range: Range;
  channel: Channel;
  totals: { current: Totals; previous: Totals };
  series: SeriesPoint[];
  videos: VideoRow[];
};

// ── Auth-scope error → surfaced as "reconnect" to the UI ───────────────────────
export class AnalyticsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyticsAuthError';
  }
}

function isScopeError(err: any): boolean {
  const reason = err?.errors?.[0]?.reason || err?.response?.data?.error?.errors?.[0]?.reason;
  const status = err?.code || err?.response?.status;
  const msg = String(err?.message || '').toLowerCase();
  return (
    reason === 'insufficientPermissions' ||
    reason === 'authError' ||
    (status === 403 && /scope|permission|insufficient/.test(msg)) ||
    status === 401 ||
    /insufficient.*scope|invalid_grant|insufficient permission/.test(msg)
  );
}

function wrap(err: any): never {
  if (isScopeError(err)) {
    throw new AnalyticsAuthError(
      'YouTube analytics access is not authorized. Re-generate GOOGLE_REFRESH_TOKEN with the youtube.readonly and yt-analytics.readonly scopes (see .env.example), then restart the server.'
    );
  }
  const msg = err?.response?.data?.error?.message || err?.message || String(err);
  throw new HttpError(502, `YouTube API error: ${msg}`);
}

// ── Clients ────────────────────────────────────────────────────────────────────
function dataClient() {
  return google.youtube({ version: 'v3', auth: googleAuth() });
}
function analyticsClient() {
  return google.youtubeAnalytics({ version: 'v2', auth: googleAuth() });
}

// ── Date helpers ───────────────────────────────────────────────────────────────
const fmt = (d: Date) => d.toISOString().slice(0, 10);

function rangeWindow(range: Range, channelPublishedAt?: string | null) {
  const end = new Date();
  if (range === 'lifetime') {
    const start = channelPublishedAt ? new Date(channelPublishedAt) : new Date('2005-02-14');
    const days = Math.max(1, Math.round((+end - +start) / 86_400_000));
    return { startDate: fmt(start), endDate: fmt(end), days };
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  return { startDate: fmt(start), endDate: fmt(end), days };
}

// Previous window of equal length, ending the day before `startDate`.
function previousWindow(startDate: string, days: number) {
  const start = new Date(startDate);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days + 1);
  return { startDate: fmt(prevStart), endDate: fmt(prevEnd) };
}

// ── Analytics row mapping ───────────────────────────────────────────────────────
const TOTAL_METRICS =
  'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares';

function rowsToObjects(resp: any): Record<string, number>[] {
  const headers: string[] = (resp?.data?.columnHeaders || []).map((h: any) => h.name);
  const rows: any[][] = resp?.data?.rows || [];
  return rows.map((r) => {
    const o: Record<string, number> = {};
    headers.forEach((h, i) => {
      const v = r[i];
      o[h] = typeof v === 'number' ? v : Number(v) || 0;
    });
    // Keep any non-numeric leading dimension (e.g. video id, day) under its header.
    headers.forEach((h, i) => {
      if (typeof r[i] === 'string') (o as any)[h] = r[i];
    });
    return o;
  });
}

const emptyTotals = (): Totals => ({
  views: 0,
  estimatedMinutesWatched: 0,
  averageViewDuration: 0,
  averageViewPercentage: 0,
  subscribersGained: 0,
  subscribersLost: 0,
  likes: 0,
  comments: 0,
  shares: 0
});

function toTotals(o: Record<string, number> | undefined): Totals {
  const t = emptyTotals();
  if (!o) return t;
  for (const k of Object.keys(t) as (keyof Totals)[]) t[k] = Number(o[k]) || 0;
  return t;
}

// ── Fetchers ────────────────────────────────────────────────────────────────────
async function fetchChannel(): Promise<Channel> {
  try {
    const res = await dataClient().channels.list({
      mine: true,
      part: ['snippet', 'statistics', 'contentDetails']
    });
    const c = res.data.items?.[0];
    if (!c) throw new AnalyticsAuthError('No YouTube channel found for the authorized account.');
    return {
      id: c.id || '',
      title: c.snippet?.title || 'My channel',
      thumbnail: c.snippet?.thumbnails?.default?.url || null,
      publishedAt: c.snippet?.publishedAt || null,
      subscriberCount: Number(c.statistics?.subscriberCount) || 0,
      viewCount: Number(c.statistics?.viewCount) || 0,
      videoCount: Number(c.statistics?.videoCount) || 0
    };
  } catch (err) {
    if (err instanceof AnalyticsAuthError) throw err;
    wrap(err);
  }
}

async function fetchTotals(startDate: string, endDate: string): Promise<Totals> {
  try {
    const res = await analyticsClient().reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: TOTAL_METRICS
    });
    return toTotals(rowsToObjects(res)[0]);
  } catch (err) {
    wrap(err);
  }
}

async function fetchSeries(startDate: string, endDate: string): Promise<SeriesPoint[]> {
  try {
    const res = await analyticsClient().reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      dimensions: 'day',
      sort: 'day',
      metrics:
        'views,subscribersGained,subscribersLost,likes,comments,shares,estimatedMinutesWatched'
    });
    return rowsToObjects(res).map((o) => {
      const views = Number(o.views) || 0;
      const likes = Number(o.likes) || 0;
      const comments = Number(o.comments) || 0;
      const shares = Number(o.shares) || 0;
      return {
        date: String((o as any).day || ''),
        views,
        subscribers: (Number(o.subscribersGained) || 0) - (Number(o.subscribersLost) || 0),
        likes,
        comments,
        watchTime: Number(o.estimatedMinutesWatched) || 0,
        engagement: views ? ((likes + comments + shares) / views) * 100 : 0
      };
    });
  } catch (err) {
    wrap(err);
  }
}

async function fetchVideoRows(startDate: string, endDate: string): Promise<VideoRow[]> {
  let analyticsRows: Record<string, number>[];
  try {
    const res = await analyticsClient().reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      dimensions: 'video',
      metrics:
        'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,likes,comments,shares',
      sort: '-views',
      maxResults: 200
    });
    analyticsRows = rowsToObjects(res);
  } catch (err) {
    wrap(err);
  }

  const ids = analyticsRows.map((r) => String((r as any).video)).filter(Boolean);
  const meta = await fetchVideoMeta(ids);

  return analyticsRows.map((r) => {
    const id = String((r as any).video);
    const views = Number(r.views) || 0;
    const likes = Number(r.likes) || 0;
    const comments = Number(r.comments) || 0;
    const shares = Number(r.shares) || 0;
    const m = meta[id];
    return {
      videoId: id,
      title: m?.title || id,
      thumbnail: m?.thumbnail || null,
      publishedAt: m?.publishedAt || null,
      views,
      likes,
      comments,
      shares,
      watchTime: Number(r.estimatedMinutesWatched) || 0,
      avgViewDuration: Number(r.averageViewDuration) || 0,
      retention: Number(r.averageViewPercentage) || 0,
      subscribersGained: Number(r.subscribersGained) || 0,
      engagementRate: views ? ((likes + comments + shares) / views) * 100 : 0
    };
  });
}

type VideoMeta = { title: string; thumbnail: string | null; publishedAt: string | null };

async function fetchVideoMeta(ids: string[]): Promise<Record<string, VideoMeta>> {
  const out: Record<string, VideoMeta> = {};
  if (!ids.length) return out;
  try {
    // videos.list accepts up to 50 ids per call.
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const res = await dataClient().videos.list({ part: ['snippet'], id: batch, maxResults: 50 });
      for (const v of res.data.items || []) {
        const t = v.snippet?.thumbnails;
        out[v.id || ''] = {
          title: v.snippet?.title || v.id || '',
          thumbnail: t?.medium?.url || t?.default?.url || null,
          publishedAt: v.snippet?.publishedAt || null
        };
      }
    }
  } catch (err) {
    wrap(err);
  }
  return out;
}

// ── Bundle (cached per range) ────────────────────────────────────────────────────
const CACHE_DIR = join(ROOT, 'analytics-cache');
const TTL_MS = 30 * 60 * 1000;
const mem = new Map<Range, Bundle>();

function cacheFile(range: Range) {
  return join(CACHE_DIR, `${range}.json`);
}

function fresh(b: Bundle | undefined): b is Bundle {
  return !!b && Date.now() - new Date(b.fetchedAt).getTime() < TTL_MS;
}

async function buildBundle(range: Range): Promise<Bundle> {
  const channel = await fetchChannel();
  const { startDate, endDate, days } = rangeWindow(range, channel.publishedAt);
  const prev = previousWindow(startDate, days);

  const [current, previous, series, videos] = await Promise.all([
    fetchTotals(startDate, endDate),
    fetchTotals(prev.startDate, prev.endDate),
    fetchSeries(startDate, endDate),
    fetchVideoRows(startDate, endDate)
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    range,
    channel,
    totals: { current, previous },
    series,
    videos
  };
}

async function getBundle(range: Range, force = false): Promise<Bundle> {
  if (!force) {
    const m = mem.get(range);
    if (fresh(m)) return m;
    if (existsSync(cacheFile(range))) {
      const disk = readJsonOr<Bundle | null>(cacheFile(range), null);
      if (fresh(disk ?? undefined)) {
        mem.set(range, disk as Bundle);
        return disk as Bundle;
      }
    }
  }
  const bundle = await buildBundle(range);
  mem.set(range, bundle);
  ensureDir(CACHE_DIR);
  writeJson(cacheFile(range), bundle);
  return bundle;
}

export function clearAnalyticsCache() {
  mem.clear();
  for (const r of RANGES) removePath(cacheFile(r));
}

function requireConfigured() {
  if (!youtubeConfigured()) {
    throw new HttpError(
      400,
      'YouTube isn’t connected — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN in the project .env.'
    );
  }
}

// ── Public API (consumed by routes) ──────────────────────────────────────────────
export async function getStatus() {
  const base = { hasClient: hasOAuthClient(), redirectUri: oauthRedirectUri() };
  if (!youtubeConfigured()) return { configured: false, needsReauth: false, ...base };
  try {
    await fetchChannel();
    return {
      configured: true,
      needsReauth: false,
      lastFetched: mem.get('30d')?.fetchedAt ?? null,
      ...base
    };
  } catch (err) {
    if (err instanceof AnalyticsAuthError) {
      return { configured: true, needsReauth: true, message: err.message, ...base };
    }
    throw err;
  }
}

function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return cur ? null : 0; // null = "new" (no baseline)
  return ((cur - prev) / prev) * 100;
}

export async function getOverview(range: Range) {
  requireConfigured();
  const b = await getBundle(range);
  const c = b.totals.current;
  const p = b.totals.previous;
  const netSubs = c.subscribersGained - c.subscribersLost;
  const prevNetSubs = p.subscribersGained - p.subscribersLost;
  const engagement = c.views ? ((c.likes + c.comments + c.shares) / c.views) * 100 : 0;
  const prevEngagement = p.views ? ((p.likes + p.comments + p.shares) / p.views) * 100 : 0;

  const card = (key: string, label: string, value: number, prevValue: number, unit?: string) => ({
    key,
    label,
    value,
    unit: unit ?? null,
    delta: pctDelta(value, prevValue)
  });

  return {
    range: b.range,
    fetchedAt: b.fetchedAt,
    channel: b.channel,
    cards: [
      card('views', 'Views', c.views, p.views),
      card('subscribers', 'Subscribers', b.channel.subscriberCount, b.channel.subscriberCount - netSubs),
      card('likes', 'Likes', c.likes, p.likes),
      card('comments', 'Comments', c.comments, p.comments),
      card('watchTime', 'Watch Time', Math.round(c.estimatedMinutesWatched), Math.round(p.estimatedMinutesWatched), 'min'),
      card('videos', 'Videos Uploaded', b.channel.videoCount, b.channel.videoCount),
      card('retention', 'Avg Retention', round1(c.averageViewPercentage), round1(p.averageViewPercentage), '%'),
      card('subGrowth', 'Subscriber Growth', netSubs, prevNetSubs),
      card('engagement', 'Engagement Rate', round1(engagement), round1(prevEngagement), '%')
    ]
  };
}

export async function getTimeseries(range: Range) {
  requireConfigured();
  const b = await getBundle(range);
  return { range: b.range, fetchedAt: b.fetchedAt, series: b.series };
}

type VideoSort =
  | 'views'
  | 'subscribers'
  | 'retention'
  | 'engagement'
  | 'likes'
  | 'comments'
  | 'watchTime'
  | 'date';

export async function getVideos(
  range: Range,
  opts: { sort?: VideoSort; search?: string; limit?: number } = {}
) {
  requireConfigured();
  const b = await getBundle(range);
  let rows = b.videos.slice();
  const q = (opts.search || '').trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.title.toLowerCase().includes(q));
  rows.sort(sorter(opts.sort || 'views'));
  if (opts.limit) rows = rows.slice(0, opts.limit);
  return { range: b.range, fetchedAt: b.fetchedAt, videos: rows };
}

function sorter(sort: VideoSort): (a: VideoRow, b: VideoRow) => number {
  switch (sort) {
    case 'subscribers':
      return (a, b) => b.subscribersGained - a.subscribersGained;
    case 'retention':
      return (a, b) => b.retention - a.retention;
    case 'engagement':
      return (a, b) => b.engagementRate - a.engagementRate;
    case 'likes':
      return (a, b) => b.likes - a.likes;
    case 'comments':
      return (a, b) => b.comments - a.comments;
    case 'watchTime':
      return (a, b) => b.watchTime - a.watchTime;
    case 'date':
      return (a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '');
    case 'views':
    default:
      return (a, b) => b.views - a.views;
  }
}

export async function getTop(range: Range) {
  requireConfigured();
  const b = await getBundle(range);
  const take = (sort: VideoSort) => b.videos.slice().sort(sorter(sort)).slice(0, 5);
  return {
    range: b.range,
    fetchedAt: b.fetchedAt,
    byViews: take('views'),
    byRetention: take('retention'),
    bySubscribers: take('subscribers'),
    byEngagement: take('engagement')
  };
}

// Per-project analytics — the published video's lifetime metrics.
export async function getProjectAnalytics(id: string) {
  readManifest(id); // 404 if the project is missing
  const videoId = getUpload(id).youtube.videoId;
  if (!videoId) return { published: false as const };
  requireConfigured();

  const channel = await fetchChannel();
  const { startDate, endDate } = rangeWindow('lifetime', channel.publishedAt);
  let row: VideoRow | null = null;
  try {
    const res = await analyticsClient().reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      dimensions: 'video',
      filters: `video==${videoId}`,
      metrics:
        'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,likes,comments,shares'
    });
    const o = rowsToObjects(res)[0];
    const meta = (await fetchVideoMeta([videoId]))[videoId];
    const views = Number(o?.views) || 0;
    const likes = Number(o?.likes) || 0;
    const comments = Number(o?.comments) || 0;
    const shares = Number(o?.shares) || 0;
    row = {
      videoId,
      title: meta?.title || videoId,
      thumbnail: meta?.thumbnail || null,
      publishedAt: meta?.publishedAt || null,
      views,
      likes,
      comments,
      shares,
      watchTime: Number(o?.estimatedMinutesWatched) || 0,
      avgViewDuration: Number(o?.averageViewDuration) || 0,
      retention: Number(o?.averageViewPercentage) || 0,
      subscribersGained: Number(o?.subscribersGained) || 0,
      engagementRate: views ? ((likes + comments + shares) / views) * 100 : 0
    };
  } catch (err) {
    wrap(err);
  }
  return { published: true as const, videoId, url: `https://youtu.be/${videoId}`, video: row };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
