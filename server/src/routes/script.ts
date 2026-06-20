import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../lib/async';
import { Scene } from '../lib/schema';
import { defaultScriptGenerator } from '../lib/llm';
import {
  addScriptVersion,
  getCurrentScript,
  getScriptVersion,
  listScriptVersions,
  readManifest,
  restoreScriptVersion,
  saveCurrentScript
} from '../lib/store';

// mergeParams lets us read :id from the parent /workspaces/:id mount.
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
    const m = readManifest(id); // 404 if workspace missing
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
      scenes: result.scenes,
      provider: result.provider,
      mock: result.mock
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
