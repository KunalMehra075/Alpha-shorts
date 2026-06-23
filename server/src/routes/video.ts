import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ah } from '../lib/async';
import {
  addElementLayer,
  deleteRender,
  getElements,
  getSounds,
  readManifest,
  removeElementLayer,
  removeElementPlacement,
  removeSoundPlacement,
  updateElementPlacement,
  updateSoundPlacement
} from '../lib/store';
import { placeSound } from '../lib/sounds';
import { placeElement, placeLibraryItemAsElement, placeUploadedElement } from '../lib/elements';
import {
  clearMusic,
  getRenderStatus,
  listRenders,
  saveMusic,
  setMusicFromGlobal,
  setMusicFromLibrary,
  startRender
} from '../lib/video';

export const videoRouter = Router({ mergeParams: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
// Project-specific element uploads can be full-length videos — allow up to 100 MB.
const elementUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const pid = (req: any) => req.params.id as string;

const SceneTl = z.object({
  index: z.number().int(),
  effect: z.string().default(''),
  transition: z.string().default('Fade'),
  durationSec: z.number(),
  motion: z.string().default('cinematic'),
  zoom: z.number().default(50),
  intensity: z.number().default(50)
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
      .optional(),
    soundsEnabled: z.boolean().optional()
  })
});

const PlaceBody = z.object({ soundId: z.string().min(1), atSec: z.number().min(0).default(0) });
const PlacementPatch = z.object({
  atSec: z.number().min(0).optional(),
  volume: z.number().min(0).max(1).optional()
});

const ElementPlaceBody = z.object({
  elementId: z.string().min(1),
  layer: z.number().int().min(0).default(0),
  atSec: z.number().min(0).default(0)
});
const ElementFromLibraryBody = z.object({
  itemId: z.string().min(1),
  layer: z.number().int().min(0).default(0),
  atSec: z.number().min(0).default(0)
});
const ElementPatch = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  size: z.number().optional(),
  rotation: z.number().optional(),
  startSec: z.number().min(0).optional(),
  endSec: z.number().min(0).optional(),
  layer: z.number().int().min(0).optional(),
  animation: z.enum(['none', 'fade', 'pop', 'pulse', 'slide']).optional(),
  muted: z.boolean().optional()
});

// GET all render records (with live progress overlaid).
videoRouter.get(
  '/',
  ah((req, res) => {
    readManifest(pid(req)); // 404 if project missing
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

// POST set the background-music track from a library audio item.
videoRouter.post(
  '/music/from-library',
  ah((req, res) => {
    const itemId = z.object({ itemId: z.string().min(1) }).parse(req.body).itemId;
    res.status(201).json(setMusicFromLibrary({ id: pid(req), itemId }));
  })
);

// POST set the background-music track from a GLOBAL media-library audio item.
videoRouter.post(
  '/music/from-global',
  ah((req, res) => {
    const itemId = z.object({ itemId: z.string().min(1) }).parse(req.body).itemId;
    res.status(201).json(setMusicFromGlobal({ id: pid(req), itemId }));
  })
);

// DELETE the background-music track.
videoRouter.delete(
  '/music',
  ah((req, res) => {
    res.json(clearMusic({ id: pid(req) }));
  })
);

// ── Timeline sound effects ────────────────────────────────────────────────────
videoRouter.get(
  '/sounds',
  ah((req, res) => {
    readManifest(pid(req));
    res.json(getSounds(pid(req)));
  })
);

videoRouter.post(
  '/sounds',
  ah(async (req, res) => {
    const body = PlaceBody.parse(req.body);
    res.status(201).json(await placeSound({ id: pid(req), soundId: body.soundId, atSec: body.atSec }));
  })
);

videoRouter.put(
  '/sounds/:placementId',
  ah((req, res) => {
    const body = PlacementPatch.parse(req.body);
    res.json(updateSoundPlacement(pid(req), req.params.placementId, body));
  })
);

videoRouter.delete(
  '/sounds/:placementId',
  ah((req, res) => {
    res.json(removeSoundPlacement(pid(req), req.params.placementId));
  })
);

// ── Elements (visual overlay placements) ──────────────────────────────────────
videoRouter.get(
  '/elements',
  ah((req, res) => {
    readManifest(pid(req));
    res.json(getElements(pid(req)));
  })
);

videoRouter.post(
  '/elements',
  ah((req, res) => {
    const body = ElementPlaceBody.parse(req.body);
    res
      .status(201)
      .json(placeElement({ id: pid(req), elementId: body.elementId, layer: body.layer, atSec: body.atSec }));
  })
);

// POST a project-specific file straight onto the timeline (multipart field
// "file"). Skips the global Elements library entirely.
videoRouter.post(
  '/elements/upload',
  elementUpload.single('file'),
  ah(async (req, res) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded (field "file").' });
      return;
    }
    const layer = Number(req.body?.layer) || 0;
    const atSec = Number(req.body?.atSec) || 0;
    res
      .status(201)
      .json(await placeUploadedElement({ id: pid(req), buffer: file.buffer, originalName: file.originalname, layer, atSec }));
  })
);

// POST turn an existing project Asset Library item into a timeline element.
videoRouter.post(
  '/elements/from-library',
  ah(async (req, res) => {
    const body = ElementFromLibraryBody.parse(req.body);
    res
      .status(201)
      .json(await placeLibraryItemAsElement({ id: pid(req), itemId: body.itemId, layer: body.layer, atSec: body.atSec }));
  })
);

// Add / remove an element lane. (Declared before ':placementId' routes so the
// literal 'layers' segment matches first.)
videoRouter.post(
  '/elements/layers',
  ah((req, res) => {
    res.status(201).json({ elementLayers: addElementLayer(pid(req)) });
  })
);

videoRouter.delete(
  '/elements/layers/:layer',
  ah((req, res) => {
    res.json(removeElementLayer(pid(req), Number(req.params.layer)));
  })
);

videoRouter.put(
  '/elements/:placementId',
  ah((req, res) => {
    const body = ElementPatch.parse(req.body);
    res.json(updateElementPlacement(pid(req), req.params.placementId, body));
  })
);

videoRouter.delete(
  '/elements/:placementId',
  ah((req, res) => {
    res.json(removeElementPlacement(pid(req), req.params.placementId));
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
