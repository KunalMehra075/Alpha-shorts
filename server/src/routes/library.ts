import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ah } from '../lib/async';
import { deleteLibraryItem, getLibrary, readManifest } from '../lib/store';
import { addToLibrary, addToLibraryFromGlobal, generateLibraryImage } from '../lib/library';

export const libraryRouter = Router({ mergeParams: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const pid = (req: any) => req.params.id as string;
const FromGlobalBody = z.object({ itemId: z.string().min(1) });
const GenerateBody = z.object({ prompt: z.string().min(1) });

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

// POST copy a GLOBAL media-library item into this project's library.
libraryRouter.post(
  '/from-global',
  ah((req, res) => {
    const body = FromGlobalBody.parse(req.body);
    res.status(201).json(addToLibraryFromGlobal({ id: pid(req), itemId: body.itemId }));
  })
);

// POST generate an AI image and add it to this project's library.
libraryRouter.post(
  '/generate',
  ah(async (req, res) => {
    const body = GenerateBody.parse(req.body);
    res.status(201).json(await generateLibraryImage({ id: pid(req), prompt: body.prompt }));
  })
);

// DELETE a library item.
libraryRouter.delete(
  '/:itemId',
  ah((req, res) => {
    res.json(deleteLibraryItem(pid(req), req.params.itemId));
  })
);
