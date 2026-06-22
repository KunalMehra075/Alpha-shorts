import { Router } from 'express';
import multer from 'multer';
import { ah } from '../lib/async';
import { addElement, deleteElement, getElementLibrary } from '../lib/elements';

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

elementsRouter.delete(
  '/:id',
  ah((req, res) => {
    res.json(deleteElement(req.params.id));
  })
);
