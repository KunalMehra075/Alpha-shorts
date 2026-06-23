import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../lib/async';
import { Language, Scene } from '../lib/schema';
import { defaultScriptGenerator } from '../lib/llm';
import {
  addScriptVersion,
  getCurrentScript,
  getScriptVersion,
  listScriptVersions,
  readManifest,
  restoreScriptVersion,
  saveCurrentScript,
  updateProject
} from '../lib/store';

// mergeParams lets us read :id from the parent /projects/:id mount.
export const scriptRouter = Router({ mergeParams: true });

const GenerateBody = z.object({
  topic: z.string().default(''),
  prompt: z.string().default(''),
  language: z.string().optional(),
  sceneCount: z.number().int().min(1).max(20).optional()
});

const scriptGenerator = defaultScriptGenerator();

const SaveBody = z.object({
  topic: z.string().optional(),
  promptUsed: z.string().optional(),
  voiceoverScript: z.string().optional(),
  scenes: z.array(Scene).optional()
});

const RestoreBody = z.object({ version: z.number().int() });

const UploadBody = z.object({
  voiceoverScript: z.string().trim().min(1, 'Script cannot be empty.'),
  topic: z.string().default(''),
  language: Language.optional()
});

// GET current script (null if none yet)
scriptRouter.get(
  '/',
  ah((req, res) => {
    res.json(getCurrentScript((req.params as any).id));
  })
);

// PUT save manual edits to the current version (in place)
scriptRouter.put(
  '/',
  ah((req, res) => {
    const body = SaveBody.parse(req.body);
    res.json(saveCurrentScript((req.params as any).id, body));
  })
);

// POST generate -> new version (LLM: DeepSeek -> OpenAI -> mock fallback)
scriptRouter.post(
  '/generate',
  ah(async (req, res) => {
    const id = (req.params as any).id;
    const m = readManifest(id); // 404 if project missing
    const body = GenerateBody.parse(req.body);

    const result = await scriptGenerator.run({
      topic: body.topic,
      prompt: body.prompt,
      language: body.language || m.language,
      sceneCount: body.sceneCount ?? 5
    });

    const sv = addScriptVersion(id, {
      topic: body.topic,
      promptUsed: body.prompt,
      voiceoverScript: result.voiceoverScript,
      scenes: [], // breakdown now happens in the Assets step (manifest.scenes)
      provider: result.provider,
      mock: result.mock
    });
    res.status(201).json(sv);
  })
);

// POST upload -> new version from user-provided text (no LLM). The optional
// language updates the project so downstream steps (breakdown/SEO/TTS) match the
// script's language (e.g. a Hindi script in an English project).
scriptRouter.post(
  '/upload',
  ah((req, res) => {
    const id = (req.params as any).id;
    readManifest(id); // 404 if project missing
    const body = UploadBody.parse(req.body);

    if (body.language) updateProject(id, { language: body.language });

    const sv = addScriptVersion(id, {
      topic: body.topic,
      promptUsed: '',
      voiceoverScript: body.voiceoverScript.trim(),
      scenes: [], // breakdown happens in the Assets step (manifest.scenes)
      provider: 'manual',
      mock: false
    });
    res.status(201).json(sv);
  })
);

// GET version list
scriptRouter.get(
  '/versions',
  ah((req, res) => {
    res.json(listScriptVersions((req.params as any).id));
  })
);

// GET a specific version's content
scriptRouter.get(
  '/versions/:version',
  ah((req, res) => {
    const version = Number(req.params.version);
    res.json(getScriptVersion((req.params as any).id, version));
  })
);

// POST restore a version as current
scriptRouter.post(
  '/restore',
  ah((req, res) => {
    const body = RestoreBody.parse(req.body);
    res.json(restoreScriptVersion((req.params as any).id, body.version));
  })
);
