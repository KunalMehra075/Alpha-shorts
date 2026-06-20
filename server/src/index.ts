import { join } from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { PORT, ROOT, WORKSPACES_DIR, ensureBaseDirs } from './lib/paths';
import { HttpError, getStats } from './lib/store';
import { listVoices } from './lib/voices';
import { workspacesRouter } from './routes/workspaces';
import { templatesRouter } from './routes/templates';

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
app.use('/api/workspaces', workspacesRouter);
app.use('/api/prompt-templates', templatesRouter);

// Serve workspace media read-only at /media/<workspaceId>/...
app.use('/media', express.static(WORKSPACES_DIR));

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
  console.log(`[shorts-dashboard] workspaces: ${WORKSPACES_DIR}`);
});
