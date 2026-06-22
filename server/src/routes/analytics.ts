import { Router } from 'express';
import { ah } from '../lib/async';
import {
  AnalyticsAuthError,
  RANGES,
  type Range,
  clearAnalyticsCache,
  getOverview,
  getStatus,
  getTimeseries,
  getTop,
  getVideos,
  getProjectAnalytics
} from '../lib/analytics';
import {
  buildAuthUrl,
  exchangeCode,
  hasOAuthClient,
  storeToken,
  takeToken
} from '../lib/googleOAuth';

function parseRange(req: any): Range {
  const r = String(req.query.range || '30d');
  return (RANGES as string[]).includes(r) ? (r as Range) : '30d';
}

// Resolve a data fetch, turning a missing-scope error into a graceful
// { needsReauth: true } payload (HTTP 200) so the UI shows a reconnect card
// instead of a hard failure.
async function reauthGuard<T>(res: any, fn: () => Promise<T>) {
  try {
    res.json(await fn());
  } catch (err) {
    if (err instanceof AnalyticsAuthError) {
      res.json({ needsReauth: true, message: err.message });
      return;
    }
    throw err;
  }
}

// ── Channel-level (app) analytics, mounted at /api/analytics ──────────────────
export const analyticsRouter = Router();

analyticsRouter.get(
  '/status',
  ah(async (_req, res) => {
    res.json(await getStatus());
  })
);

analyticsRouter.get(
  '/overview',
  ah((req, res) => reauthGuard(res, () => getOverview(parseRange(req))))
);

analyticsRouter.get(
  '/timeseries',
  ah((req, res) => reauthGuard(res, () => getTimeseries(parseRange(req))))
);

analyticsRouter.get(
  '/videos',
  ah((req, res) =>
    reauthGuard(res, () =>
      getVideos(parseRange(req), {
        sort: req.query.sort as any,
        search: req.query.search as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      })
    )
  )
);

analyticsRouter.get(
  '/top',
  ah((req, res) => reauthGuard(res, () => getTop(parseRange(req))))
);

analyticsRouter.post(
  '/refresh',
  ah((_req, res) => {
    clearAnalyticsCache();
    res.json({ ok: true });
  })
);

// ── OAuth connect flow (mint a refresh token in-app) ──────────────────────────
// These endpoints handle secrets, so restrict them to loopback requests.
function localOnly(req: any, res: any): boolean {
  const host = String(req.hostname || '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  res.status(403).send('This endpoint is only available locally.');
  return false;
}

function resultPage(message: string, token: string | null): string {
  const tokenBlock = token
    ? `<p style="color:#9aa">You can also copy it here:</p>
       <textarea readonly onclick="this.select()" style="width:100%;min-height:80px;background:#111;color:#eee;border:1px solid #333;border-radius:8px;padding:10px;font-family:monospace;font-size:12px">${token}</textarea>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>YouTube connect</title></head>
    <body style="background:#0a0a0a;color:#eee;font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 20px">
      <h2>${message}</h2>
      ${tokenBlock}
      <p style="color:#9aa;margin-top:20px">Return to the dashboard tab — the token will appear there automatically. You can close this window.</p>
      <script>try{window.close()}catch(e){}</script>
    </body></html>`;
}

// Kick off consent — redirect the browser to Google.
analyticsRouter.get('/oauth/start', (req, res) => {
  if (!localOnly(req, res)) return;
  if (!hasOAuthClient()) {
    res.status(400).send('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first, then restart.');
    return;
  }
  res.redirect(buildAuthUrl());
});

// Google redirects here with ?code= — exchange it for a refresh token.
analyticsRouter.get(
  '/oauth/callback',
  ah(async (req, res) => {
    if (!localOnly(req, res)) return;
    const err = req.query.error as string | undefined;
    const code = req.query.code as string | undefined;
    if (err) {
      res.status(400).send(resultPage(`Authorization failed: ${err}`, null));
      return;
    }
    if (!code) {
      res.status(400).send(resultPage('Missing authorization code.', null));
      return;
    }
    try {
      const token = await exchangeCode(code);
      storeToken(token);
      res.send(resultPage('✅ Connected to YouTube', token));
    } catch (e: any) {
      res.status(400).send(resultPage(`Could not get a refresh token: ${e?.message || e}`, null));
    }
  })
);

// Dashboard polls this after opening the popup; returns the token once.
analyticsRouter.get('/oauth/result', (req, res) => {
  if (!localOnly(req, res)) return;
  const t = takeToken();
  res.json(t ? { refreshToken: t } : { pending: true });
});

// ── Per-project analytics, mounted at /api/projects/:id/analytics ──────────
export const projectAnalyticsRouter = Router({ mergeParams: true });

projectAnalyticsRouter.get(
  '/',
  ah((req: any, res) => reauthGuard(res, () => getProjectAnalytics(req.params.id)))
);
