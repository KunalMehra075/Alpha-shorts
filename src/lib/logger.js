import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { paths, ensureDirs } from './paths.js';

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

const LEVEL_COLOR = {
  INFO: COLORS.cyan,
  OK: COLORS.green,
  WARN: COLORS.yellow,
  ERROR: COLORS.red,
  DEBUG: COLORS.dim
};

function timestamp() {
  return new Date().toISOString();
}

/**
 * Create a logger that writes to the console (colorized) and appends to
 * logs/<name>-<YYYY-MM-DD>.log (plain text).
 */
export function createLogger(name) {
  ensureDirs();
  const date = new Date().toISOString().slice(0, 10);
  const file = join(paths.logs, `${name}-${date}.log`);
  const stream = createWriteStream(file, { flags: 'a' });

  function write(level, message) {
    const ts = timestamp();
    const plain = `[${ts}] [${level}] ${message}`;
    stream.write(plain + '\n');

    const color = LEVEL_COLOR[level] || '';
    const out = level === 'ERROR' ? process.stderr : process.stdout;
    out.write(`${COLORS.dim}${ts}${COLORS.reset} ${color}${level.padEnd(5)}${COLORS.reset} ${message}\n`);
  }

  return {
    file,
    info: (m) => write('INFO', m),
    ok: (m) => write('OK', m),
    warn: (m) => write('WARN', m),
    error: (m) => write('ERROR', m),
    debug: (m) => {
      if (process.env.DEBUG) write('DEBUG', m);
    },
    close: () =>
      new Promise((resolve) => {
        stream.end(resolve);
      })
  };
}
