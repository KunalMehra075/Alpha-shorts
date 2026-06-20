import { readdirSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

// Extensions we'll quietly strip if the user includes one in the argument,
// so `name`, `name.txt`, `name.mp3`, `videoscripts/name.txt` all resolve the
// same. Unknown extensions (e.g. "attack.on.titan") are kept verbatim.
const STRIPPABLE_EXT = new Set(['.txt', '.mp3', '.wav', '.m4a', '.mov']);

/** Error type for user-facing CLI problems (printed without a stack trace). */
export class CliError extends Error {}

// Map language flags to a language code. Returns undefined if none given.
function detectLanguage(flags) {
  const has = (...names) => names.some((n) => flags.has(n));
  if (has('-hi', '--hi', '--hindi')) return 'hi';
  if (has('-en', '--en', '--english')) return 'en';
  return undefined;
}

// Map background flags to a mode. Returns undefined if none given.
function detectBackground(flags) {
  const has = (...names) => names.some((n) => flags.has(n));
  if (has('--green', '-g', '--greenscreen')) return 'greenscreen';
  if (has('--transparent', '-t')) return 'transparent';
  return undefined;
}

/**
 * Parse positional/flag arguments from argv (defaults to this process's args).
 * Returns the first positional as `name`, recognized flags, and the language
 * selected by `-hi`/`-en` (undefined if neither given -> caller's default).
 */
export function parseCliArgs(argv = process.argv.slice(2)) {
  const flags = new Set();
  const positionals = [];
  for (const arg of argv) {
    if (arg.startsWith('-')) flags.add(arg);
    else if (arg.trim() !== '') positionals.push(arg);
  }
  return {
    name: positionals[0],
    force: flags.has('--force') || flags.has('-f'),
    language: detectLanguage(flags),
    background: detectBackground(flags),
    flags,
    positionals
  };
}

/**
 * Turn a user-supplied argument into a base name:
 *   "attack-on-titan"            -> "attack-on-titan"
 *   "attack-on-titan.txt"        -> "attack-on-titan"
 *   "videoscripts/my clip.mp3"   -> "my clip"
 *   "attack.on.titan"            -> "attack.on.titan"  (unknown ext kept)
 */
export function normalizeName(arg) {
  const base = basename(arg.trim());
  const ext = extname(base).toLowerCase();
  return STRIPPABLE_EXT.has(ext) ? base.slice(0, -ext.length) : base;
}

/** List base names (no extension) of files with `ext` in `dir`, sorted. */
function listBaseNames(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => extname(f).toLowerCase() === ext)
    .map((f) => basename(f, extname(f)))
    .sort();
}

/**
 * Resolve which files to process.
 *  - If `name` is given, return just that one file (validated to exist).
 *  - Otherwise return every `ext` file in `dir`.
 *
 * @returns {{ files: string[], single: boolean }} file names (with extension)
 * @throws {CliError} if a named file does not exist (message lists available)
 */
export function resolveTargets({ dir, ext, name, label, emptyHint }) {
  if (name) {
    const base = normalizeName(name);
    const file = `${base}${ext}`;
    if (!existsSync(join(dir, file))) {
      const available = listBaseNames(dir, ext);
      const hint = available.length
        ? `Available ${label}:\n  ${available.join('\n  ')}`
        : emptyHint || `No ${ext} files found in ${dir}.`;
      throw new CliError(`Could not find "${file}" in ${dir}.\n${hint}`);
    }
    return { files: [file], single: true };
  }

  const files = readdirSync(dir)
    .filter((f) => extname(f).toLowerCase() === ext)
    .sort();
  return { files, single: false };
}
