import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../lib/async';
import { Language } from '../lib/schema';
import {
  createWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  listWorkspaces,
  readManifest,
  updateWorkspace
} from '../lib/store';
import { scriptRouter } from './script';
import { audioRouter } from './audio';
import { captionRouter } from './caption';
import { assetsRouter } from './assets';
import { videoRouter } from './video';

export const workspacesRouter = Router();

const CreateBody = z.object({
  name: z.string().min(1),
  language: Language.optional()
});

const UpdateBody = z.object({
  name: z.string().min(1).optional(),
  language: Language.optional()
});

workspacesRouter.get(
  '/',
  ah((_req, res) => {
    res.json(listWorkspaces());
  })
);

workspacesRouter.post(
  '/',
  ah((req, res) => {
    const body = CreateBody.parse(req.body);
    res.status(201).json(createWorkspace(body.name, body.language));
  })
);

workspacesRouter.get(
  '/:id',
  ah((req, res) => {
    res.json(readManifest(req.params.id));
  })
);

workspacesRouter.patch(
  '/:id',
  ah((req, res) => {
    const body = UpdateBody.parse(req.body);
    res.json(updateWorkspace(req.params.id, body));
  })
);

workspacesRouter.post(
  '/:id/duplicate',
  ah((req, res) => {
    res.status(201).json(duplicateWorkspace(req.params.id));
  })
);

workspacesRouter.delete(
  '/:id',
  ah((req, res) => {
    deleteWorkspace(req.params.id);
    res.status(204).end();
  })
);

// Nested routes: /api/workspaces/:id/script... and .../audio...
workspacesRouter.use('/:id/script', scriptRouter);
workspacesRouter.use('/:id/audio', audioRouter);
workspacesRouter.use('/:id/caption', captionRouter);
workspacesRouter.use('/:id/assets', assetsRouter);
workspacesRouter.use('/:id/video', videoRouter);
