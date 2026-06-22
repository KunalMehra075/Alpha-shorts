// In-memory job registry for the long-running Assets operations (AI scene
// breakdown + stock auto-fill). Because the state lives on the server (not in a
// React component), progress survives the client navigating away and back: any
// mount just polls GET /scenes/jobs and sees the running job. Mirrors the render
// job manager in lib/video.ts. State is transient — a server restart drops it
// (the client then simply sees no running job).
import { autofill } from './assets';
import { buildBreakdown } from './scenes';

export type AssetJobType = 'breakdown' | 'autofill';

export type AssetJob = {
  type: AssetJobType;
  status: 'running' | 'done' | 'error';
  total: number; // scenes to process (0 until known)
  done: number; // scenes processed so far
  error?: string;
  startedAt: string;
  updatedAt: string;
  // Completion details so the client can show an accurate toast.
  meta?: { mock?: boolean; provider?: string; source?: string; sceneCount?: number };
};

const jobs = new Map<string, AssetJob>();
const k = (id: string, type: AssetJobType) => `${id}:${type}`;
const now = () => new Date().toISOString();

export function getAssetJob(id: string, type: AssetJobType): AssetJob | null {
  return jobs.get(k(id, type)) ?? null;
}

export function getAssetJobs(id: string): { breakdown: AssetJob | null; autofill: AssetJob | null } {
  return { breakdown: getAssetJob(id, 'breakdown'), autofill: getAssetJob(id, 'autofill') };
}

// Start (or return the already-running) breakdown job. Fire-and-forget — the
// route returns the job immediately and the client polls for completion.
export function startBreakdownJob(id: string): AssetJob {
  const key = k(id, 'breakdown');
  const existing = jobs.get(key);
  if (existing?.status === 'running') return existing;

  const job: AssetJob = {
    type: 'breakdown',
    status: 'running',
    total: 0,
    done: 0,
    startedAt: now(),
    updatedAt: now()
  };
  jobs.set(key, job);

  void (async () => {
    try {
      const r = await buildBreakdown(id);
      job.total = r.scenes.length;
      job.done = r.scenes.length;
      job.meta = { mock: r.mock, provider: r.provider, source: r.source, sceneCount: r.scenes.length };
      job.status = 'done';
    } catch (err: any) {
      job.status = 'error';
      job.error = String(err?.message ?? err);
    } finally {
      job.updatedAt = now();
    }
  })();

  return job;
}

// Start (or return the already-running) auto-fill job. It selects each scene's
// top stock result one at a time, writing the manifest after each so the client
// (polling GET /assets) sees scenes fill in top-to-bottom.
export function startAutofillJob(id: string): AssetJob {
  const key = k(id, 'autofill');
  const existing = jobs.get(key);
  if (existing?.status === 'running') return existing;

  const job: AssetJob = {
    type: 'autofill',
    status: 'running',
    total: 0,
    done: 0,
    startedAt: now(),
    updatedAt: now()
  };
  jobs.set(key, job);

  void (async () => {
    try {
      await autofill({
        id,
        onProgress: (done, total) => {
          job.done = done;
          job.total = total;
          job.updatedAt = now();
        }
      });
      job.status = 'done';
    } catch (err: any) {
      job.status = 'error';
      job.error = String(err?.message ?? err);
    } finally {
      job.updatedAt = now();
    }
  })();

  return job;
}
