import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { paths } from './paths.js';

function run(cmd, args, logger) {
  return new Promise((resolve, reject) => {
    logger?.debug(`exec: ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    child.stdout.on('data', (d) => logger?.debug(d.toString().trimEnd()));
    child.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      logger?.debug(text.trimEnd());
    });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            `Could not find "${cmd}". Is Whisper installed and on your PATH? ` +
              `Install with: pip install -U openai-whisper`
          )
        );
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}\n${stderr}`));
    });
  });
}

/**
 * Transcribe an audio file with Whisper, producing word-level timestamps.
 * Returns a flat array of words: [{ word, start, end }].
 *
 * The Whisper CLI writes <name>.json into generated-subtitles/, which we reuse
 * on subsequent runs (skip re-transcription) unless `force` is set.
 */
export async function transcribe({ audioPath, config, logger, force = false }) {
  const name = basename(audioPath, extname(audioPath));
  const jsonPath = join(paths.subtitles, `${name}.json`);

  if (!force && existsSync(jsonPath)) {
    logger?.info(`Reusing existing transcript: ${name}.json`);
  } else {
    const { bin, model, language } = config.whisper;
    const args = [
      audioPath,
      '--model',
      model,
      '--word_timestamps',
      'True',
      '--output_format',
      'json',
      '--output_dir',
      paths.subtitles,
      '--verbose',
      'False'
    ];
    if (language) args.push('--language', language);

    logger?.info(
      `Transcribing with ${bin} (model=${model}, language=${
        language || 'auto-detect'
      })...`
    );
    await run(bin, args, logger);

    if (!existsSync(jsonPath)) {
      throw new Error(
        `Whisper did not produce expected transcript at ${jsonPath}`
      );
    }
  }

  const data = JSON.parse(await readFile(jsonPath, 'utf8'));
  const words = extractWords(data);
  if (words.length === 0) {
    throw new Error(
      `No word-level timestamps found in ${name}.json. ` +
        `Ensure Whisper supports --word_timestamps (openai-whisper or whisper-ctranslate2).`
    );
  }
  return { words, jsonPath, name };
}

/** Flatten Whisper segment/word output into a clean [{word,start,end}] list. */
function extractWords(data) {
  const words = [];
  for (const seg of data.segments || []) {
    for (const w of seg.words || []) {
      const text = (w.word ?? w.text ?? '').trim();
      if (!text) continue;
      if (typeof w.start !== 'number' || typeof w.end !== 'number') continue;
      words.push({ word: text, start: w.start, end: Math.max(w.end, w.start) });
    }
  }
  return words;
}
