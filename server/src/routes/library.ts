import { Router } from 'express';
import multer from 'multer';
import { ah } from '../lib/async';
import { deleteLibraryItem, getLibrary, readManifest } from '../lib/store';
import { addToLibrary } from '../lib/library';

export const libraryRouter = Router({ mergeParams: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const pid = (req: any) => req.params.id as string;

// GET all library items.
libraryRouter.get(
  '/',
  ah((req, res) => {
    readManifest(pid(req));
    res.json(getLibrary(pid(req)));
  })
);

// POST add a media file to the library (multipart field "file").
libraryRouter.post(
  '/',
  upload.single('file'),
  ah((req, res) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded (field "file").' });
      return;
    }
    res.status(201).json(addToLibrary({ id: pid(req), buffer: file.buffer, originalName: file.originalname }));
  })
);

// DELETE a library item.
libraryRouter.delete(
  '/:itemId',
  ah((req, res) => {
    res.json(deleteLibraryItem(pid(req), req.params.itemId));
  })
);
