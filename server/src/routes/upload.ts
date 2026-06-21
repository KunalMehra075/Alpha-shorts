import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../lib/async';
import { getUpload, readManifest, setUpload } from '../lib/store';
import { generateSeo } from '../lib/seo';
import { publishStatus, startPublish } from '../lib/youtube';

export const uploadRouter = Router({ mergeParams: true });

const pid = (req: any) => req.params.id as string;

const UploadPatch = z.object({
  platform: z.string().optional(),
  visibility: z.enum(['public', 'private', 'unlisted']).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional()
});

// GET current upload metadata.
uploadRouter.get(
  '/',
  ah((req, res) => {
    readManifest(pid(req)); // 404 if missing
    res.json(getUpload(pid(req)));
  })
);

// PUT save upload metadata (title/description/tags/visibility/platform).
uploadRouter.put(
  '/',
  ah((req, res) => {
    const body = UploadPatch.parse(req.body);
    res.json(setUpload(pid(req), body));
  })
);

// POST generate SEO suggestions (titles/descriptions/tags) via the LLM.
uploadRouter.post(
  '/seo',
  ah(async (req, res) => {
    readManifest(pid(req));
    res.json(await generateSeo(pid(req)));
  })
);

// GET YouTube publish status (+ whether OAuth is configured), for polling.
uploadRouter.get(
  '/youtube',
  ah((req, res) => {
    readManifest(pid(req));
    res.json(publishStatus(pid(req)));
  })
);

// POST start a real YouTube upload of the latest completed render (background job).
uploadRouter.post(
  '/publish',
  ah((req, res) => {
    res.status(201).json(startPublish(pid(req)));
  })
);
