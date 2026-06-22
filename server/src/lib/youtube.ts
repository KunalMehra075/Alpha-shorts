import { createReadStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { google } from 'googleapis';
import { workspaceDir } from './paths';
import { HttpError, getRenders, getUpload, setUploadYoutube } from './store';
import type { RenderRecord } from './schema';

// True when the Google OAuth env vars are present (user adds these to .env).
export function youtubeConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );
}

// OAuth2 client wired with the refresh token — the googleapis client mints fresh
// access tokens automatically, so no interactive consent is needed at runtime.
// Shared by the uploader (youtube.upload scope) and the analytics module
// (youtube.readonly + yt-analytics.readonly scopes) — the token's granted scopes
// determine which calls succeed.
export function googleAuth() {
  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth;
}

function ytClient() {
  return google.youtube({ version: 'v3', auth: googleAuth() });
}

function latestCompletedRender(id: string): RenderRecord | null {
  return getRenders(id).find((r) => r.status === 'completed' && r.file) ?? null;
}

// ── Job manager (one upload at a time; in-memory live progress) ───────────────
const active = new Map<string, { progress: number }>();
let busy = false;

export function startPublish(id: string) {
  if (!youtubeConfigured()) {
    throw new HttpError(
      400,
      'YouTube isn’t connected — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN in the project .env.'
    );
  }
  if (busy) throw new HttpError(409, 'An upload is already in progress. Please wait for it to finish.');

  const render = latestCompletedRender(id);
  if (!render) {
    throw new HttpError(400, 'No completed render to upload — render a video in the Video Editor first.');
  }
  const up = getUpload(id);
  if (!up.title.trim()) throw new HttpError(400, 'Add a title before publishing.');

  busy = true;
  active.set(id, { progress: 0 });
  const rec = setUploadYoutube(id, {
    status: 'uploading',
    progress: 0,
    videoId: null,
    url: null,
    renderId: render.id,
    error: undefined,
    thumbnailWarning: undefined
  });

  void runPublish(id, render);
  return rec;
}

async function runPublish(id: string, render: RenderRecord) {
  try {
    const up = getUpload(id);
    const file = join(workspaceDir(id), render.file!);
    const size = statSync(file).size;
    const youtube = ytClient();

    const res = await youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: up.title.slice(0, 100),
            description: up.description || '',
            categoryId: process.env.VIDEO_CATEGORY_ID?.trim() || '22',
            tags: up.tags?.length ? up.tags : undefined
          },
          status: {
            privacyStatus: up.visibility, // public | unlisted | private (user's choice)
            selfDeclaredMadeForKids: false
          }
        },
        media: { body: createReadStream(file) }
      },
      {
        onUploadProgress: (evt: any) => {
          const pct = size ? Math.min(99, Math.round((evt.bytesRead / size) * 100)) : 0;
          active.set(id, { progress: pct });
        }
      }
    );

    const videoId = res.data.id;
    if (!videoId) throw new Error('Upload completed but no video ID was returned.');

    // Custom thumbnail is a separate API call (thumbnails.set) made after the
    // video exists. It needs a verified channel, so failure here is NON-FATAL:
    // the video is already published — we just surface a warning.
    let thumbnailWarning: string | undefined;
    const thumb = up.thumbnail?.file;
    if (thumb) {
      const thumbPath = join(workspaceDir(id), thumb);
      if (existsSync(thumbPath)) {
        try {
          await youtube.thumbnails.set({ videoId, media: { body: createReadStream(thumbPath) } });
        } catch (err: any) {
          thumbnailWarning =
            err?.response?.data?.error?.message ||
            err?.message ||
            'Custom thumbnail could not be set (your channel may need verification).';
        }
      } else {
        thumbnailWarning = 'Thumbnail file was missing at publish time.';
      }
    }

    setUploadYoutube(id, {
      status: 'completed',
      progress: 100,
      videoId,
      url: `https://youtu.be/${videoId}`,
      uploadedAt: new Date().toISOString(),
      thumbnailWarning
    });
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message || err?.message || String(err);
    setUploadYoutube(id, { status: 'failed', error: msg });
  } finally {
    busy = false;
    active.delete(id);
  }
}

export function publishStatus(id: string) {
  const yt = getUpload(id).youtube;
  const live = active.get(id);
  let merged = live ? { ...yt, progress: live.progress } : yt;
  // Stale sweep: marked uploading but no live job (e.g. server restarted).
  if (merged.status === 'uploading' && !active.has(id) && !busy) {
    merged = setUploadYoutube(id, { status: 'failed', error: 'Upload interrupted (server restarted).' });
  }
  return { configured: youtubeConfigured(), ...merged };
}
