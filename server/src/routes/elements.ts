import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ah } from '../lib/async';
import {
  addElement,
  applyBackgroundRemoval,
  deleteElement,
  getElementLibrary,
  previewBackgroundRemoval,
  renameElement
} from '../lib/elements';

// App-level (global) Elements library — overlay images/gifs/videos shared across
// all projects. Mirrors the sounds + media library routers.
export const elementsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

elementsRouter.get(
  '/',
  ah((_req, res) => {
    res.json(getElementLibrary());
  })
);

elementsRouter.post(
  '/',
  upload.single('file'),
  ah(async (req, res) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded (field "file").' });
      return;
    }
    res.status(201).json(await addElement({ buffer: file.buffer, originalName: file.originalname }));
  })
);

const BgBody = z.object({
  color: z.string().default('#00ff00'),
  similarity: z.number().min(0).max(1).default(0.2),
  blend: z.number().min(0).max(1).default(0.1),
  despill: z.boolean().default(true)
});

// POST bake a quick keyed preview (not added to the library).
elementsRouter.post(
  '/:id/bg-preview',
  ah(async (req, res) => {
    const body = BgBody.parse(req.body);
    res.json(await previewBackgroundRemoval(req.params.id, body));
  })
);

// POST bake the full keyed result and add it as a new transparent element.
elementsRouter.post(
  '/:id/bg-apply',
  ah(async (req, res) => {
    const body = BgBody.parse(req.body);
    res.status(201).json(await applyBackgroundRemoval(req.params.id, body));
  })
);

const RenameBody = z.object({ name: z.string().min(1) });

// PUT rename an element.
elementsRouter.put(
  '/:id',
  ah((req, res) => {
    const body = RenameBody.parse(req.body);
    res.json(renameElement(req.params.id, body.name));
  })
);

elementsRouter.delete(
  '/:id',
  ah((req, res) => {
    res.json(deleteElement(req.params.id));
  })
);
