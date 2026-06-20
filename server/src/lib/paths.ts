import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

// server/src/lib -> project root is three levels up.
const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..', '..', '..');

export const WORKSPACES_DIR = process.env.DASH_WORKSPACES_DIR
  ? resolve(process.env.DASH_WORKSPACES_DIR)
  : join(ROOT, 'workspaces');

export const CONFIG_DIR = join(ROOT, 'config');
export const TEMPLATES_FILE = join(CONFIG_DIR, 'prompt-templates.json');

export const PORT = Number(process.env.DASH_PORT) || 8787;

export function workspaceDir(id: string) {
  return join(WORKSPACES_DIR, id);
}

export function ensureBaseDirs() {
  mkdirSync(WORKSPACES_DIR, { recursive: true });
  mkdirSync(CONFIG_DIR, { recursive: true });
}
