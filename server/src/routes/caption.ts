import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../lib/async';
import { CaptionLine, CaptionSettings } from '../lib/schema';
import { getCaptions, readManifest } from '../lib/store';
import { fixCaptions, generateCaptions, renderCaptionOverlay, saveCaptions } from '../lib/caption';

export const captionRouter = Router({ mergeParams: true });

const pid = (req: any) => req.params.id as string;

const GenerateBody = z.object({
  language: z.string().optional(),
  settings: CaptionSettings.optional(),
  // force = re-run Whisper from scratch (discard the cached transcript). Set when
  // the user clicks "Re-transcribe" — e.g. after switching the caption language.
  force: z.boolean().optional()
});

const SaveBody = z.object({
  settings: CaptionSettings,
  lines: z.array(CaptionLine)
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
    // Also force when the requested language differs from the cached transcript's
    // language — the Whisper cache is keyed by audio file, not language, so a
    // language switch would otherwise silently reuse the old transcript.
    const force = body.force === true || (m.captions.hasTranscript && language !== m.captions.language);
    const state = await generateCaptions({ id, language, settings, force });
    res.status(201).json(state);
  })
);

// POST fix captions in place using the script as ground truth (align + AI fallback)
captionRouter.post(
  '/fix',
  ah(async (req, res) => {
    readManifest(pid(req));
    res.json(await fixCaptions(pid(req)));
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

// POST render the caption overlay videos (normal + greenscreen, with audio)
captionRouter.post(
  '/render',
  ah(async (req, res) => {
    const overlay = await renderCaptionOverlay({ id: pid(req) });
    res.status(201).json(overlay);
  })
);
