import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../lib/async';
import { CaptionLine, CaptionSettings } from '../lib/schema';
import { getCaptions, readManifest } from '../lib/store';
import { generateCaptions, renderCaptionOverlay, saveCaptions } from '../lib/caption';

export const captionRouter = Router({ mergeParams: true });

const pid = (req: any) => req.params.id as string;

const GenerateBody = z.object({
  language: z.string().optional(),
  settings: CaptionSettings.optional()
});

const SaveBody = z.object({
  settings: CaptionSettings,
  lines: z.array(CaptionLine)
});

const RenderBody = z.object({
  background: z.enum(['transparent', 'greenscreen']).default('transparent')
});

// GET current caption state
captionRouter.get(
  '/',
  ah((req, res) => {
    readManifest(pid(req));
    res.json(getCaptions(pid(req)));
  })
);

// POST generate (real Whisper transcription)
captionRouter.post(
  '/generate',
  ah(async (req, res) => {
    const id = pid(req);
    const m = readManifest(id);
    const body = GenerateBody.parse(req.body);
    const settings = CaptionSettings.parse(body.settings ?? m.captions.settings ?? {});
    const language = body.language || m.captions.language || m.language;
    const state = await generateCaptions({ id, language, settings });
    res.status(201).json(state);
  })
);

// PUT save edited settings + lines
captionRouter.put(
  '/',
  ah((req, res) => {
    const body = SaveBody.parse(req.body);
    res.json(saveCaptions({ id: pid(req), settings: body.settings, lines: body.lines }));
  })
);

// POST render the caption overlay video
captionRouter.post(
  '/render',
  ah(async (req, res) => {
    const body = RenderBody.parse(req.body);
    const overlay = await renderCaptionOverlay({ id: pid(req), background: body.background });
    res.status(201).json(overlay);
  })
);
