import { Router } from 'express';
import multer from 'multer';
import { ah } from '../lib/async';
import { addMedia, deleteMedia, getMediaLibrary, type MediaKind } from '../lib/media';

// App-level (global) media library — images / videos / music shared across all
// workspaces.
export const mediaRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

mediaRouter.get(
  '/',
  ah((req, res) => {
    const k = req.query.kind as string | undefined;
    const kind = k === 'image' || k === 'video' || k === 'audio' ? (k as MediaKind) : undefined;
    res.json(getMediaLibrary(kind));
  })
);

mediaRouter.post(
  '/',
  upload.single('file'),
  ah(async (req, res) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded (field "file").' });
      return;
    }
    res.status(201).json(await addMedia({ buffer: file.buffer, originalName: file.originalname }));
  })
);

mediaRouter.delete(
  '/:id',
  ah((req, res) => {
    res.json(deleteMedia(req.params.id));
  })
);
