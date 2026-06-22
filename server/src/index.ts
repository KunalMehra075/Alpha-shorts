import { join } from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { PORT, ROOT, PROJECTS_DIR, ensureBaseDirs } from './lib/paths';
import { HttpError, getStats } from './lib/store';
import { listVoices } from './lib/voices';
import { projectsRouter } from './routes/projects';
import { templatesRouter } from './routes/templates';
import { soundsRouter } from './routes/sounds';
import { GLOBAL_SOUNDS_DIR } from './lib/sounds';
import { mediaRouter } from './routes/media';
import { GLOBAL_MEDIA_DIR } from './lib/media';
import { analyticsRouter } from './routes/analytics';
import { aiRouter } from './routes/ai';
import { elementsRouter } from './routes/elements';
import { GLOBAL_ELEMENTS_DIR } from './lib/elements';

// Load the project-root .env (ELEVENLABS_API_KEY, FFPROBE_BIN, …). The server
// runs from server/, so point dotenv at the root explicitly.
dotenv.config({ path: join(ROOT, '.env') });

ensureBaseDirs();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/stats', (_req, res) => res.json(getStats()));
app.get('/api/voices', (_req, res) => res.json(listVoices()));
app.use('/api/projects', projectsRouter);
app.use('/api/prompt-templates', templatesRouter);
app.use('/api/sounds', soundsRouter);
app.use('/api/media-library', mediaRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/elements', elementsRouter);

// Serve project media read-only at /media/<projectId>/...
app.use('/media', express.static(PROJECTS_DIR));
// Serve the global sound library read-only at /sounds/...
app.use('/sounds', express.static(GLOBAL_SOUNDS_DIR));
// Serve the global media library (images/videos/music) read-only at /library/...
app.use('/library', express.static(GLOBAL_MEDIA_DIR));
// Serve the global Elements library read-only at /element-lib/... (distinct from
// the client-side /elements route).
app.use('/element-lib', express.static(GLOBAL_ELEMENTS_DIR));

// 404 for unknown API routes
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler: map known errors to clean JSON.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid request', details: err.flatten() });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[shorts-dashboard] API listening on http://localhost:${PORT}`);
  console.log(`[shorts-dashboard] projects: ${PROJECTS_DIR}`);
});
