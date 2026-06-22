import { Router } from 'express';
import multer from 'multer';
import { ah } from '../lib/async';
import { addSound, deleteSound, getSoundLibrary } from '../lib/sounds';

// App-level (global) sound library — shared across all projects.
export const soundsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

soundsRouter.get(
  '/',
  ah(async (_req, res) => {
    res.json(await getSoundLibrary());
  })
);

soundsRouter.post(
  '/',
  upload.single('file'),
  ah(async (req, res) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded (field "file").' });
      return;
    }
    res.status(201).json(await addSound({ buffer: file.buffer, originalName: file.originalname }));
  })
);

soundsRouter.delete(
  '/:id',
  ah((req, res) => {
    res.json(deleteSound(req.params.id));
  })
);
