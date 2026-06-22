import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ah } from '../lib/async';
import { getUpload, readManifest, setUpload } from '../lib/store';
import { generateSeo } from '../lib/seo';
import { publishStatus, startPublish } from '../lib/youtube';
import {
  clearThumbnail,
  setThumbnailFromAsset,
  setThumbnailFromFrame,
  setThumbnailFromGenerated,
  setThumbnailFromUpload
} from '../lib/thumbnail';

export const uploadRouter = Router({ mergeParams: true });

const pid = (req: any) => req.params.id as string;

// Generous multer cap; the 2 MB YouTube limit is enforced (with a friendly
// message) in the thumbnail lib so oversized files don't 500 here.
const thumbUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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

// POST import a thumbnail from the user's computer (JPG/PNG, ≤ 2 MB).
uploadRouter.post(
  '/thumbnail',
  thumbUpload.single('file'),
  ah((req, res) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded (field "file").' });
      return;
    }
    res.status(201).json(
      setThumbnailFromUpload({ id: pid(req), buffer: file.buffer, originalName: file.originalname })
    );
  })
);

const ThumbFromAsset = z.object({
  source: z.enum(['library', 'global']),
  itemId: z.string().min(1)
});

// POST set the thumbnail from a project-library or global-media image.
uploadRouter.post(
  '/thumbnail/from-asset',
  ah((req, res) => {
    const body = ThumbFromAsset.parse(req.body);
    res.status(201).json(setThumbnailFromAsset({ id: pid(req), ...body }));
  })
);

const FromFrame = z.object({ atSec: z.number().min(0).optional() });

// POST grab a (random) frame from the latest render as the thumbnail.
uploadRouter.post(
  '/thumbnail/from-frame',
  ah(async (req, res) => {
    const body = FromFrame.parse(req.body ?? {});
    res.status(201).json(await setThumbnailFromFrame({ id: pid(req), atSec: body.atSec }));
  })
);

const GenerateThumb = z.object({ prompt: z.string().min(1) });

// POST generate a thumbnail with the AI image chain.
uploadRouter.post(
  '/thumbnail/generate',
  ah(async (req, res) => {
    const body = GenerateThumb.parse(req.body);
    res.status(201).json(await setThumbnailFromGenerated({ id: pid(req), prompt: body.prompt }));
  })
);

// DELETE remove the current thumbnail.
uploadRouter.delete(
  '/thumbnail',
  ah((req, res) => {
    res.json(clearThumbnail(pid(req)));
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
