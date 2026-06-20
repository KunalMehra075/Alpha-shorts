import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../lib/async';
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  updateTemplate
} from '../lib/store';

export const templatesRouter = Router();

const CreateBody = z.object({ name: z.string().min(1), body: z.string().default('') });
const UpdateBody = z.object({ name: z.string().optional(), body: z.string().optional() });

templatesRouter.get(
  '/',
  ah((_req, res) => res.json(listTemplates()))
);

templatesRouter.post(
  '/',
  ah((req, res) => {
    const b = CreateBody.parse(req.body);
    res.status(201).json(createTemplate(b.name, b.body));
  })
);

templatesRouter.put(
  '/:id',
  ah((req, res) => {
    const b = UpdateBody.parse(req.body);
    res.json(updateTemplate(req.params.id, b));
  })
);

templatesRouter.delete(
  '/:id',
  ah((req, res) => {
    deleteTemplate(req.params.id);
    res.status(204).end();
  })
);
