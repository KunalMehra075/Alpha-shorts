import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ah } from '../lib/async';
import {
  deleteAudioVersion,
  getAudioState,
  readManifest,
  selectAudioVersion
} from '../lib/store';
import { generateTake, saveUploadedTake } from '../lib/audio';

export const audioRouter = Router({ mergeParams: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const GenerateBody = z.object({
  voiceId: z.string().min(1),
  stability: z.number().min(0).max(100).optional(),
  similarity: z.number().min(0).max(100).optional(),
  speed: z.number().min(1).max(2).optional()
});

const SelectBody = z.object({ version: z.number().int() });

const pid = (req: any) => req.params.id as string;

// GET current audio state { currentVersion, versions }
audioRouter.get(
  '/',
  ah((req, res) => {
    readManifest(pid(req)); // 404 if workspace missing
    res.json(getAudioState(pid(req)));
  })
);

// POST generate -> new take (real ElevenLabs call)
audioRouter.post(
  '/generate',
  ah(async (req, res) => {
    const body = GenerateBody.parse(req.body);
    const take = await generateTake({
      id: pid(req),
      voiceId: body.voiceId,
      stability: body.stability ?? 50,
      similarity: body.similarity ?? 75,
      speed: body.speed ?? 1
    });
    res.status(201).json(take);
  })
);

// POST select a version as current
audioRouter.post(
  '/select',
  ah((req, res) => {
    const body = SelectBody.parse(req.body);
    res.json(selectAudioVersion(pid(req), body.version));
  })
);

// DELETE a version
audioRouter.delete(
  '/:version',
  ah((req, res) => {
    res.json(deleteAudioVersion(pid(req), Number(req.params.version)));
  })
);

// POST upload your own audio (multipart field "file")
audioRouter.post(
  '/upload',
  upload.single('file'),
  ah(async (req, res) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded (field "file").' });
      return;
    }
    const take = await saveUploadedTake({
      id: pid(req),
      buffer: file.buffer,
      originalName: file.originalname,
      speed: Number((req as any).body?.speed) || 1
    });
    res.status(201).json(take);
  })
);
