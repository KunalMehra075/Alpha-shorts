import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ah } from '../lib/async';
import { deleteRender, readManifest } from '../lib/store';
import { clearMusic, getRenderStatus, listRenders, saveMusic, startRender } from '../lib/video';

export const videoRouter = Router({ mergeParams: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

const pid = (req: any) => req.params.id as string;

const SceneTl = z.object({
  index: z.number().int(),
  effect: z.string().default(''),
  transition: z.string().default('Fade'),
  durationSec: z.number()
});

const RenderBody = z.object({
  timeline: z.object({
    scenes: z.array(SceneTl).default([]),
    captionsEnabled: z.boolean().default(true),
    preset: z.string().nullable().default(null),
    music: z
      .object({
        enabled: z.boolean().default(false),
        volume: z.number().default(30),
        fadeIn: z.boolean().default(true),
        fadeOut: z.boolean().default(true)
      })
      .optional()
  })
});

// GET all render records (with live progress overlaid).
videoRouter.get(
  '/',
  ah((req, res) => {
    readManifest(pid(req)); // 404 if workspace missing
    res.json(listRenders(pid(req)));
  })
);

// POST start a background render → returns the new record immediately.
videoRouter.post(
  '/',
  ah((req, res) => {
    const body = RenderBody.parse(req.body);
    res.status(201).json(startRender(pid(req), body.timeline));
  })
);

// POST upload a background-music track (multipart field "file").
videoRouter.post(
  '/music',
  upload.single('file'),
  ah((req, res) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded (field "file").' });
      return;
    }
    res.status(201).json(saveMusic({ id: pid(req), buffer: file.buffer, originalName: file.originalname }));
  })
);

// DELETE the background-music track.
videoRouter.delete(
  '/music',
  ah((req, res) => {
    res.json(clearMusic({ id: pid(req) }));
  })
);

// GET one render's status (polling).
videoRouter.get(
  '/:rid',
  ah((req, res) => {
    res.json(getRenderStatus(pid(req), req.params.rid));
  })
);

// DELETE a render (removes the file + record).
videoRouter.delete(
  '/:rid',
  ah((req, res) => {
    res.json(deleteRender(pid(req), req.params.rid));
  })
);
