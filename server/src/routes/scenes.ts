import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../lib/async';
import { addScene, getScenes, readManifest, removeScene, updateScene } from '../lib/store';
import { addSceneFromMedia, buildBreakdown } from '../lib/scenes';

export const scenesRouter = Router({ mergeParams: true });

const pid = (req: any) => req.params.id as string;

const ScenePatch = z.object({
  spokenLine: z.string().optional(),
  visualType: z.enum(['Image', 'Video', 'Animation', 'SplitScreen']).optional(),
  searchKeywords: z.array(z.string()).optional(),
  imagePrompt: z.string().optional(),
  visualDescription: z.string().optional(),
  durationSec: z.number().min(0.5).max(60).optional()
});

const AddBody = z.object({
  visualType: z.enum(['Image', 'Video', 'Animation', 'SplitScreen']).default('Image'),
  durationSec: z.number().min(0.5).max(60).optional()
});

const FromMediaBody = z.object({
  source: z.enum(['library', 'global']),
  itemId: z.string().min(1),
  durationSec: z.number().min(0.5).max(60).optional(),
  trimStartSec: z.number().min(0).optional(),
  trimEndSec: z.number().min(0.5).optional()
});

// GET the canonical breakdown (backfills from the script version if needed).
scenesRouter.get(
  '/',
  ah((req, res) => {
    readManifest(pid(req)); // 404 if project missing
    res.json(getScenes(pid(req)));
  })
);

// POST build the breakdown from the script OR the caption transcript.
scenesRouter.post(
  '/breakdown',
  ah(async (req, res) => {
    res.status(201).json(await buildBreakdown(pid(req)));
  })
);

// POST add an empty (manual) scene.
scenesRouter.post(
  '/',
  ah((req, res) => {
    const body = AddBody.parse(req.body);
    res.status(201).json(addScene(pid(req), body));
  })
);

// POST add a manual scene built from a chosen library/global asset (+ trim).
scenesRouter.post(
  '/from-media',
  ah(async (req, res) => {
    const body = FromMediaBody.parse(req.body);
    res.status(201).json(await addSceneFromMedia({ id: pid(req), ...body }));
  })
);

// PUT edit one scene's fields (incl. duration → re-flows the timeline).
scenesRouter.put(
  '/:scene',
  ah((req, res) => {
    const body = ScenePatch.parse(req.body);
    res.json(updateScene(pid(req), Number(req.params.scene), body));
  })
);

// DELETE one scene (+ its asset row/file), renumbering the rest.
scenesRouter.delete(
  '/:scene',
  ah((req, res) => {
    res.json(removeScene(pid(req), Number(req.params.scene)));
  })
);
