import { Router } from 'express';
import { ah } from '../lib/async';
import { imageGenAvailable } from '../lib/image';

// App-level AI capability endpoints (used by the dashboard to gate UI).
export const aiRouter = Router();

// GET whether image generation is configured + which providers are available.
aiRouter.get(
  '/image-status',
  ah((_req, res) => {
    res.json(imageGenAvailable());
  })
);
