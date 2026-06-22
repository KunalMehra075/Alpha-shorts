import { google } from 'googleapis';
import { PORT } from './paths';

// All scopes the app needs end-to-end (upload + analytics read + future revenue).
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/yt-analytics-monetary.readonly'
];

export function hasOAuthClient() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// Loopback redirect — auto-allowed for "Desktop app" OAuth clients. Override via
// GOOGLE_OAUTH_REDIRECT if you use a Web client (and register it in the console).
export function oauthRedirectUri() {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT ||
    `http://localhost:${PORT}/api/analytics/oauth/callback`
  );
}

function client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    oauthRedirectUri()
  );
}

export function buildAuthUrl() {
  return client().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token even on re-consent
    scope: SCOPES,
    include_granted_scopes: true
  });
}

export async function exchangeCode(code: string): Promise<string> {
  const { tokens } = await client().getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. Remove this app at myaccount.google.com/permissions, then connect again.'
    );
  }
  return tokens.refresh_token;
}

// One-shot, in-memory store for the freshly minted token so the dashboard can
// pull it once after the popup completes (local single-user app).
let pending: { refreshToken: string; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

export function storeToken(refreshToken: string) {
  pending = { refreshToken, at: Date.now() };
}

export function takeToken(): string | null {
  if (pending && Date.now() - pending.at < TTL_MS) {
    const t = pending.refreshToken;
    pending = null;
    return t;
  }
  pending = null;
  return null;
}
