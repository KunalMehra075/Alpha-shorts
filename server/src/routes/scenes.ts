import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../lib/async';
import { getScenes, readManifest, updateScene } from '../lib/store';
import { buildBreakdown } from '../lib/scenes';

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

// GET the canonical breakdown (backfills from the script version if needed).
scenesRouter.get(
  '/',
  ah((req, res) => {
    readManifest(pid(req)); // 404 if workspace missing
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

// PUT edit one scene's fields (incl. duration → re-flows the timeline).
scenesRouter.put(
  '/:scene',
  ah((req, res) => {
    const body = ScenePatch.parse(req.body);
    res.json(updateScene(pid(req), Number(req.params.scene), body));
  })
);
