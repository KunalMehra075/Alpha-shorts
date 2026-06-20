import { join } from 'node:path';
import { z } from 'zod';
import { CONFIG_DIR } from './paths';
import { readJsonOr } from './fsx';

export const Voice = z.object({
  id: z.string(),
  name: z.string(),
  tagline: z.string().default(''),
  description: z.string().default(''),
  language: z.string().default('en'),
  accent: z.string().default(''),
  gender: z.string().default('')
});
export type Voice = z.infer<typeof Voice>;

const VOICES_FILE = join(CONFIG_DIR, 'voices.json');

export function listVoices(): Voice[] {
  const raw = readJsonOr<unknown[]>(VOICES_FILE, []);
  return z.array(Voice).parse(raw);
}

export function findVoice(id: string): Voice | undefined {
  return listVoices().find((v) => v.id === id);
}
