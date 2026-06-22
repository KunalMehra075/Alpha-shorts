import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../lib/async';
import { Language } from '../lib/schema';
import {
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  readManifest,
  updateProject
} from '../lib/store';
import { scriptRouter } from './script';
import { audioRouter } from './audio';
import { captionRouter } from './caption';
import { assetsRouter } from './assets';
import { videoRouter } from './video';
import { scenesRouter } from './scenes';
import { uploadRouter } from './upload';
import { libraryRouter } from './library';
import { projectAnalyticsRouter } from './analytics';

export const projectsRouter = Router();

const CreateBody = z.object({
  name: z.string().min(1),
  language: Language.optional()
});

const UpdateBody = z.object({
  name: z.string().min(1).optional(),
  language: Language.optional()
});

projectsRouter.get(
  '/',
  ah((_req, res) => {
    res.json(listProjects());
  })
);

projectsRouter.post(
  '/',
  ah((req, res) => {
    const body = CreateBody.parse(req.body);
    res.status(201).json(createProject(body.name, body.language));
  })
);

projectsRouter.get(
  '/:id',
  ah((req, res) => {
    res.json(readManifest(req.params.id));
  })
);

projectsRouter.patch(
  '/:id',
  ah((req, res) => {
    const body = UpdateBody.parse(req.body);
    res.json(updateProject(req.params.id, body));
  })
);

projectsRouter.post(
  '/:id/duplicate',
  ah((req, res) => {
    res.status(201).json(duplicateProject(req.params.id));
  })
);

projectsRouter.delete(
  '/:id',
  ah((req, res) => {
    deleteProject(req.params.id);
    res.status(204).end();
  })
);

// Nested routes: /api/projects/:id/script... and .../audio...
projectsRouter.use('/:id/script', scriptRouter);
projectsRouter.use('/:id/audio', audioRouter);
projectsRouter.use('/:id/caption', captionRouter);
projectsRouter.use('/:id/assets', assetsRouter);
projectsRouter.use('/:id/scenes', scenesRouter);
projectsRouter.use('/:id/video', videoRouter);
projectsRouter.use('/:id/upload', uploadRouter);
projectsRouter.use('/:id/library', libraryRouter);
projectsRouter.use('/:id/analytics', projectAnalyticsRouter);
