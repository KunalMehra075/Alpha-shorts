import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ah } from '../lib/async';
import { AssetRef } from '../lib/schema';
import { ensureSceneRows, readManifest } from '../lib/store';
import {
  autofill,
  clearScene,
  saveSceneMeta,
  searchScene,
  selectScene,
  selectSceneFromGlobal,
  selectSceneFromLibrary,
  setSceneTrim,
  uploadScene
} from '../lib/assets';

export const assetsRouter = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

const pid = (req: any) => req.params.id as string;
const sceneNum = (req: any) => Number(req.params.scene);

const SearchBody = z.object({ keywords: z.array(z.string()).default([]) });
const SaveBody = z.object({
  keywords: z.array(z.string()).default([]),
  imagePrompt: z.string().default('')
});
const SelectBody = z.object({ ref: AssetRef });
const SelectLibraryBody = z.object({ itemId: z.string().min(1) });
const TrimBody = z.object({ trimStartSec: z.number().min(0), trimEndSec: z.number().min(0.5) });

// GET current assets state (scene rows initialized from the script).
assetsRouter.get(
  '/',
  ah((req, res) => {
    readManifest(pid(req)); // 404 if workspace missing
    res.json(ensureSceneRows(pid(req)));
  })
);

// POST search stock/library candidates for a scene.
assetsRouter.post(
  '/:scene/search',
  ah(async (req, res) => {
    const body = SearchBody.parse(req.body);
    res.json(await searchScene({ id: pid(req), sceneNumber: sceneNum(req), keywords: body.keywords }));
  })
);

// POST select a candidate (downloads/copies it into the workspace).
assetsRouter.post(
  '/:scene/select',
  ah(async (req, res) => {
    const body = SelectBody.parse(req.body);
    res.json(await selectScene({ id: pid(req), sceneNumber: sceneNum(req), ref: body.ref }));
  })
);

// POST select a library image/video for a scene (copies it into the workspace).
assetsRouter.post(
  '/:scene/select-library',
  ah(async (req, res) => {
    const body = SelectLibraryBody.parse(req.body);
    res.json(await selectSceneFromLibrary({ id: pid(req), sceneNumber: sceneNum(req), itemId: body.itemId }));
  })
);

// POST select a GLOBAL media-library image/video for a scene.
assetsRouter.post(
  '/:scene/select-global',
  ah(async (req, res) => {
    const body = SelectLibraryBody.parse(req.body);
    res.json(await selectSceneFromGlobal({ id: pid(req), sceneNumber: sceneNum(req), itemId: body.itemId }));
  })
);

// PUT set the video trim window on a scene's selected asset (syncs duration).
assetsRouter.put(
  '/:scene/trim',
  ah(async (req, res) => {
    const body = TrimBody.parse(req.body);
    res.json(
      await setSceneTrim({
        id: pid(req),
        sceneNumber: sceneNum(req),
        trimStartSec: body.trimStartSec,
        trimEndSec: body.trimEndSec
      })
    );
  })
);

// DELETE the current selection for a scene.
assetsRouter.delete(
  '/:scene/select',
  ah((req, res) => {
    res.json(clearScene({ id: pid(req), sceneNumber: sceneNum(req) }));
  })
);

// PUT save scene meta (keywords + image prompt).
assetsRouter.put(
  '/:scene',
  ah((req, res) => {
    const body = SaveBody.parse(req.body);
    res.json(
      saveSceneMeta({
        id: pid(req),
        sceneNumber: sceneNum(req),
        keywords: body.keywords,
        imagePrompt: body.imagePrompt
      })
    );
  })
);

// POST upload your own image/video for a scene (multipart field "file").
assetsRouter.post(
  '/:scene/upload',
  upload.single('file'),
  ah((req, res) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded (field "file").' });
      return;
    }
    res.status(201).json(
      uploadScene({
        id: pid(req),
        sceneNumber: sceneNum(req),
        buffer: file.buffer,
        originalName: file.originalname
      })
    );
  })
);

// POST auto-fill every unselected scene with its top-ranked candidate.
assetsRouter.post(
  '/autofill',
  ah(async (req, res) => {
    res.json(await autofill({ id: pid(req) }));
  })
);
