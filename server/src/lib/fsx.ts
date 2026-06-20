import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname } from 'node:path';

export function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function readJsonOr<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    return readJson<T>(file);
  } catch {
    return fallback;
  }
}

// Atomic-ish JSON write: write a temp file then rename into place.
export function writeJson(file: string, data: unknown) {
  ensureDir(dirname(file));
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);
}

export function removePath(target: string) {
  rmSync(target, { recursive: true, force: true });
}

export function copyDir(src: string, dest: string) {
  cpSync(src, dest, { recursive: true });
}

export { existsSync };
